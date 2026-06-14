"use server";

import { requireTenantContext } from "@/lib/auth/guards";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import { decimalToNumber } from "@/lib/money";
import type { StockUnitCode } from "@/lib/stock-unit";
import type {
  ActionResult,
  SalesDashboardData,
  SaleLineView,
  SaleSummary,
  TodaySalesMetrics,
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

function topDrugKey(medicineId: string, stockUnit: StockUnitCode): string {
  return `${medicineId}:${stockUnit}`;
}

function mapSaleLine(
  line: {
    id: string;
    saleId: string;
    genericName: string;
    dosageForm: string;
    strength: string;
    itemType: CatalogItemType;
    quantity: number;
    stockUnit: string;
    unitsPerPack: number | null;
    unitPrice: { toString(): string };
    lineTotal: { toString(): string };
    status: "ACTIVE" | "VOIDED";
    correctionNote: string | null;
    createdAt: Date;
    stockBatch: { batchNumber: string | null };
  },
): SaleLineView {
  return {
    id: line.id,
    saleId: line.saleId,
    genericName: line.genericName,
    dosageForm: line.dosageForm,
    strength: line.strength,
    itemType: line.itemType,
    batchNumber: line.stockBatch.batchNumber,
    quantity: line.quantity,
    stockUnit: line.stockUnit as StockUnitCode,
    unitsPerPack: line.unitsPerPack,
    unitPrice: decimalToNumber(line.unitPrice),
    lineTotal: decimalToNumber(line.lineTotal),
    status: line.status,
    correctionNote: line.correctionNote,
    createdAt: line.createdAt.toISOString(),
  };
}

async function getTodayMetrics(
  db: TenantPrismaClient,
  from: Date,
): Promise<TodaySalesMetrics> {
  const sales = await db.sale.findMany({
    where: { createdAt: { gte: from } },
    include: {
      lines: {
        include: { medicine: { select: { itemType: true } } },
      },
    },
  });

  let unitsSold = 0;
  let grossRevenue = 0;
  let lineCount = 0;
  let voidedLines = 0;
  const byItemTypeAcc = emptyRevenueByItemType();

  for (const sale of sales) {
    for (const line of sale.lines) {
      lineCount++;
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

  return {
    saleCount: sales.length,
    lineCount,
    unitsSold,
    grossRevenue,
    voidedLines,
    byItemType: finalizeRevenueByItemType(byItemTypeAcc),
  };
}

async function getTopDrugs(
  db: TenantPrismaClient,
  from: Date,
  limit: number,
): Promise<TopSellingDrug[]> {
  const lines = await db.saleLine.findMany({
    where: {
      status: "ACTIVE",
      createdAt: { gte: from },
    },
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
    const existing = map.get(key);
    const revenue = decimalToNumber(line.lineTotal);

    if (existing) {
      existing.unitsSold += line.quantity;
      existing.revenue += revenue;
      existing.dispenseCount += 1;
      if (line.unitsPerPack && !existing.unitsPerPack) {
        existing.unitsPerPack = line.unitsPerPack;
      }
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
    .sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue)
    .slice(0, limit)
    .map(
      ({
        medicineId,
        genericName,
        dosageForm,
        strength,
        itemType,
        stockUnit,
        unitsPerPack,
        unitsSold,
        revenue,
        dispenseCount,
      }) => ({
        medicineId,
        genericName,
        dosageForm,
        strength,
        itemType,
        stockUnit,
        unitsPerPack,
        unitsSold,
        revenue,
        dispenseCount,
      }),
    );
}

export async function getSalesDashboard(): Promise<
  ActionResult<SalesDashboardData>
> {
  const ctx = await requireTenantContext("sales.view");
  return runAction(
    "getSalesDashboard",
    async () => {
    const { db } = ctx;
    const todayStart = startOfToday();
    const weekStart = daysAgo(7);

    const salesToday = await db.sale.findMany({
      where: { createdAt: { gte: todayStart } },
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

    const todaySales: SaleSummary[] = salesToday.map((sale) => {
      const lines = sale.lines.map((line) =>
        mapSaleLine({
          ...line,
          itemType: resolveLineItemType(line),
        }),
      );
      const activeLines = lines.filter((l) => l.status === "ACTIVE");
      return {
        id: sale.id,
        createdAt: sale.createdAt.toISOString(),
        totalAmount: decimalToNumber(sale.totalAmount),
        activeLineCount: activeLines.length,
        lines,
      };
    });

    return {
      today: await getTodayMetrics(db, todayStart),
      todaySales,
      topDrugsToday: await getTopDrugs(db, todayStart, 10),
      topDrugs7Days: await getTopDrugs(db, weekStart, 15),
    };
  },
    { tenantId: ctx.tenantId },
  );
}
