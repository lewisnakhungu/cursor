"use server";

import { requireTenantContext } from "@/lib/auth/guards";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import { decimalToNumber } from "@/lib/money";
import { getStockingInsights } from "@/lib/actions/insights";
import type { StockUnitCode } from "@/lib/stock-unit";
import type {
  ActionResult,
  ReportPeriodDays,
  SalesByDayRow,
  SalesReportData,
  SalesReportLineDetail,
  StockReportData,
  StockReportRow,
  TopSellingDrug,
} from "@/lib/types";
import { runAction } from "@/lib/actions/utils";
import {
  accumulateRevenueByItemType,
  emptyRevenueByItemType,
  finalizeRevenueByItemType,
  resolveLineItemType,
} from "@/lib/report-item-type";
import type { CatalogItemType } from "@/lib/types";

const FACILITY_NAME =
  process.env.NEXT_PUBLIC_FACILITY_NAME ?? "AfyaSmart Facility";

const EXPIRY_WARNING_DAYS = 90;
const LOW_STOCK_THRESHOLD = 10;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function topDrugKey(medicineId: string, stockUnit: StockUnitCode): string {
  return `${medicineId}:${stockUnit}`;
}

async function getTopDrugs(
  db: TenantPrismaClient,
  from: Date,
  limit: number,
): Promise<TopSellingDrug[]> {
  const lines = await db.saleLine.findMany({
    where: { status: "ACTIVE", createdAt: { gte: from } },
    include: {
      medicine: {
        select: {
          id: true,
          genericName: true,
          dosageForm: true,
          strength: true,
          itemType: true,
        },
      },
    },
  });

  const map = new Map<string, TopSellingDrug>();

  for (const line of lines) {
    const stockUnit = line.stockUnit as StockUnitCode;
    const key = topDrugKey(line.medicineId, stockUnit);
    const revenue = decimalToNumber(line.lineTotal);
    const existing = map.get(key);

    if (existing) {
      existing.unitsSold += line.quantity;
      existing.revenue += revenue;
      existing.dispenseCount += 1;
    } else {
      map.set(key, {
        medicineId: line.medicine.id,
        genericName: line.medicine.genericName,
        dosageForm: line.medicine.dosageForm,
        strength: line.medicine.strength,
        itemType: resolveLineItemType(line),
        stockUnit,
        unitsPerPack: line.unitsPerPack,
        unitsSold: line.quantity,
        revenue,
        dispenseCount: 1,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold)
    .slice(0, limit);
}

function buildSalesByDay(
  sales: Array<{
    createdAt: Date;
    lines: Array<{
      status: string;
      quantity: number;
      lineTotal: { toString(): string };
      itemType: CatalogItemType;
      medicine?: { itemType: CatalogItemType } | null;
    }>;
  }>,
): SalesByDayRow[] {
  const dayMap = new Map<string, SalesByDayRow>();

  for (const sale of sales) {
    const day = new Date(sale.createdAt);
    day.setHours(0, 0, 0, 0);
    const key = day.toISOString().slice(0, 10);
    const row = dayMap.get(key) ?? {
      date: key,
      label: formatDateLabel(day),
      saleCount: 0,
      unitsSold: 0,
      revenue: 0,
      medicineRevenue: 0,
      nonPharmRevenue: 0,
    };
    row.saleCount += 1;
    for (const line of sale.lines) {
      if (line.status !== "ACTIVE") continue;
      const revenue = decimalToNumber(line.lineTotal);
      row.unitsSold += line.quantity;
      row.revenue += revenue;
      if (resolveLineItemType(line) === "NON_PHARM") {
        row.nonPharmRevenue += revenue;
      } else {
        row.medicineRevenue += revenue;
      }
    }
    dayMap.set(key, row);
  }

  return Array.from(dayMap.values())
    .map((row) => ({
      ...row,
      revenue: Math.round(row.revenue * 100) / 100,
      medicineRevenue: Math.round(row.medicineRevenue * 100) / 100,
      nonPharmRevenue: Math.round(row.nonPharmRevenue * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function buildLineDetails(
  db: TenantPrismaClient,
  from: Date,
): Promise<SalesReportLineDetail[]> {
  const sales = await db.sale.findMany({
    where: { createdAt: { gte: from } },
    include: {
      lines: {
        include: {
          medicine: { select: { itemType: true } },
          stockBatch: { select: { batchNumber: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const details: SalesReportLineDetail[] = [];

  for (const sale of sales) {
    for (const line of sale.lines) {
      details.push({
        saleId: sale.id,
        saleAt: sale.createdAt.toISOString(),
        lineId: line.id,
        genericName: line.genericName,
        dosageForm: line.dosageForm,
        strength: line.strength,
        itemType: resolveLineItemType(line),
        batchNumber: line.stockBatch.batchNumber,
        quantity: line.quantity,
        stockUnit: line.stockUnit as StockUnitCode,
        unitsPerPack: line.unitsPerPack,
        unitPrice: decimalToNumber(line.unitPrice),
        lineTotal: decimalToNumber(line.lineTotal),
        status: line.status,
      });
    }
  }

  return details;
}

export async function getSalesReport(
  periodDays: ReportPeriodDays,
): Promise<ActionResult<SalesReportData>> {
  const ctx = await requireTenantContext("reports.view");
  return runAction(
    "getSalesReport",
    async () => {
      const { db } = ctx;
      const since = daysAgo(periodDays);
      const periodEnd = startOfToday();
      const periodStart = since;

      const sales = await db.sale.findMany({
        where: { createdAt: { gte: since } },
        include: {
          lines: {
            include: { medicine: { select: { itemType: true } } },
          },
        },
      });

      let unitsSold = 0;
      let grossRevenue = 0;
      let voidedLines = 0;
      const byItemTypeAcc = emptyRevenueByItemType();

      for (const sale of sales) {
        for (const line of sale.lines) {
          if (line.status === "VOIDED") {
            voidedLines++;
            continue;
          }
          const revenue = decimalToNumber(line.lineTotal);
          unitsSold += line.quantity;
          grossRevenue += revenue;
          accumulateRevenueByItemType(
            byItemTypeAcc,
            resolveLineItemType(line),
            line.quantity,
            revenue,
          );
        }
      }

      const saleCount = sales.length;
      const averageSaleValue =
        saleCount > 0 ? Math.round((grossRevenue / saleCount) * 100) / 100 : 0;

      const insightsResult = await getStockingInsights(periodDays);
      const insights = insightsResult.success ? insightsResult.data : null;

      const periodLabel =
        periodDays === 7 ? "Weekly report (7 days)" : "Monthly report (30 days)";

      return {
        reportTitle:
          periodDays === 7
            ? "Weekly Sales & Stocking Report"
            : "Monthly Sales & Stocking Report",
        periodDays,
        periodLabel,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        generatedAt: new Date().toISOString(),
        facilityName: FACILITY_NAME,
        sales: {
          saleCount,
          unitsSold,
          grossRevenue: Math.round(grossRevenue * 100) / 100,
          voidedLines,
          averageSaleValue,
          byItemType: finalizeRevenueByItemType(byItemTypeAcc),
        },
        salesByDay: buildSalesByDay(sales),
        topDrugs: await getTopDrugs(db, since, 20),
        lineDetails: await buildLineDetails(db, since),
        stocking: insights?.summary ?? null,
        weeklyRestockTrend: insights?.weeklyTrend ?? [],
        topRestocked: insights?.topRestocked ?? [],
      };
  },
    { tenantId: ctx.tenantId },
  );
}

export async function getStockReport(): Promise<ActionResult<StockReportData>> {
  const ctx = await requireTenantContext("reports.view");
  return runAction(
    "getStockReport",
    async () => {
      const { db } = ctx;
      const today = startOfToday();

      const batches = await db.stockBatch.findMany({
        where: {
          quantityOnHand: { gt: 0 },
          expiryDate: { gte: today },
        },
        include: {
          medicine: {
            select: {
              genericName: true,
              dosageForm: true,
              strength: true,
              itemType: true,
            },
          },
        },
        orderBy: [
          { medicine: { genericName: "asc" } },
          { expiryDate: "asc" },
        ],
      });

      const rows: StockReportRow[] = batches.map((batch) => {
        const expiry = batch.expiryDate;
        const daysUntilExpiry = Math.ceil(
          (expiry.getTime() - today.getTime()) / 86_400_000,
        );
        const retail = batch.retailSalePrice
          ? decimalToNumber(batch.retailSalePrice)
          : null;
        const flags: string[] = [];
        if (daysUntilExpiry <= 30) flags.push("Critical expiry");
        else if (daysUntilExpiry <= 90) flags.push("Expiring soon");
        if (batch.quantityOnHand <= LOW_STOCK_THRESHOLD) flags.push("Low stock");

        return {
          genericName: batch.medicine.genericName,
          dosageForm: batch.medicine.dosageForm,
          strength: batch.medicine.strength,
          itemType: batch.medicine.itemType,
          batchNumber: batch.batchNumber,
          supplierName: batch.supplierName,
          quantityOnHand: batch.quantityOnHand,
          stockUnit: batch.stockUnit as StockUnitCode,
          unitsPerPack: batch.unitsPerPack,
          expiryDate: expiry.toISOString().slice(0, 10),
          daysUntilExpiry,
          retailSalePrice: retail,
          stockValue:
            retail !== null
              ? Math.round(retail * batch.quantityOnHand * 100) / 100
              : null,
          flags,
        };
      });

      let totalUnits = 0;
      let estimatedRetailValue = 0;
      let expiringWithin90Count = 0;
      let lowStockCount = 0;
      const byItemType = {
        medicineBatches: 0,
        nonPharmBatches: 0,
        medicineUnits: 0,
        nonPharmUnits: 0,
        medicineRetailValue: 0,
        nonPharmRetailValue: 0,
      };

      for (const row of rows) {
        totalUnits += row.quantityOnHand;
        if (row.stockValue !== null) estimatedRetailValue += row.stockValue;
        if (row.daysUntilExpiry <= EXPIRY_WARNING_DAYS) expiringWithin90Count++;
        if (row.flags.includes("Low stock")) lowStockCount++;

        if (row.itemType === "NON_PHARM") {
          byItemType.nonPharmBatches += 1;
          byItemType.nonPharmUnits += row.quantityOnHand;
          if (row.stockValue !== null) {
            byItemType.nonPharmRetailValue += row.stockValue;
          }
        } else {
          byItemType.medicineBatches += 1;
          byItemType.medicineUnits += row.quantityOnHand;
          if (row.stockValue !== null) {
            byItemType.medicineRetailValue += row.stockValue;
          }
        }
      }

      return {
        reportTitle: "Available Stock Report",
        generatedAt: new Date().toISOString(),
        facilityName: FACILITY_NAME,
        totalBatches: rows.length,
        totalUnits,
        estimatedRetailValue: Math.round(estimatedRetailValue * 100) / 100,
        expiringWithin90Count,
        lowStockCount,
        byItemType: {
          medicineBatches: byItemType.medicineBatches,
          nonPharmBatches: byItemType.nonPharmBatches,
          medicineUnits: byItemType.medicineUnits,
          nonPharmUnits: byItemType.nonPharmUnits,
          medicineRetailValue:
            Math.round(byItemType.medicineRetailValue * 100) / 100,
          nonPharmRetailValue:
            Math.round(byItemType.nonPharmRetailValue * 100) / 100,
        },
        rows,
      };
  },
    { tenantId: ctx.tenantId },
  );
}
