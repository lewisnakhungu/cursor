"use server";

import { prisma } from "@/lib/prisma";
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
  from: Date,
  limit: number,
): Promise<TopSellingDrug[]> {
  const lines = await prisma.saleLine.findMany({
    where: { status: "ACTIVE", createdAt: { gte: from } },
    include: {
      medicine: {
        select: { id: true, genericName: true, dosageForm: true, strength: true },
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
    };
    row.saleCount += 1;
    for (const line of sale.lines) {
      if (line.status !== "ACTIVE") continue;
      row.unitsSold += line.quantity;
      row.revenue += decimalToNumber(line.lineTotal);
    }
    dayMap.set(key, row);
  }

  return Array.from(dayMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

async function buildLineDetails(from: Date): Promise<SalesReportLineDetail[]> {
  const sales = await prisma.sale.findMany({
    where: { createdAt: { gte: from } },
    include: {
      lines: {
        include: { stockBatch: { select: { batchNumber: true } } },
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
  return runAction("getSalesReport", async () => {
      const since = daysAgo(periodDays);
      const periodEnd = startOfToday();
      const periodStart = since;

      const sales = await prisma.sale.findMany({
        where: { createdAt: { gte: since } },
        include: { lines: true },
      });

      let unitsSold = 0;
      let grossRevenue = 0;
      let voidedLines = 0;

      for (const sale of sales) {
        for (const line of sale.lines) {
          if (line.status === "VOIDED") {
            voidedLines++;
            continue;
          }
          unitsSold += line.quantity;
          grossRevenue += decimalToNumber(line.lineTotal);
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
        },
        salesByDay: buildSalesByDay(sales),
        topDrugs: await getTopDrugs(since, 20),
        lineDetails: await buildLineDetails(since),
        stocking: insights?.summary ?? null,
        weeklyRestockTrend: insights?.weeklyTrend ?? [],
        topRestocked: insights?.topRestocked ?? [],
      };
  });
}

export async function getStockReport(): Promise<ActionResult<StockReportData>> {
  return runAction("getStockReport", async () => {
      const today = startOfToday();

      const batches = await prisma.stockBatch.findMany({
        where: {
          quantityOnHand: { gt: 0 },
          expiryDate: { gte: today },
        },
        include: {
          medicine: {
            select: { genericName: true, dosageForm: true, strength: true },
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

      for (const row of rows) {
        totalUnits += row.quantityOnHand;
        if (row.stockValue !== null) estimatedRetailValue += row.stockValue;
        if (row.daysUntilExpiry <= EXPIRY_WARNING_DAYS) expiringWithin90Count++;
        if (row.flags.includes("Low stock")) lowStockCount++;
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
        rows,
      };
  });
}
