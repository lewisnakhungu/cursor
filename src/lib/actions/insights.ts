"use server";

import { requireTenantContext } from "@/lib/auth/guards";
import { decimalToNumber } from "@/lib/money";
import type { StockUnitCode } from "@/lib/stock-unit";
import type {
  ActionResult,
  InsightsPeriodDays,
  ReceiveHistoryRow,
  StockingInsightsData,
  TopRestockedItem,
  WeeklyStockingBucket,
} from "@/lib/types";
import { runAction } from "@/lib/actions/utils";

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

function periodLabel(days: InsightsPeriodDays): string {
  switch (days) {
    case 7:
      return "Last 7 days";
    case 30:
      return "Last 30 days";
    case 90:
      return "Last 90 days";
    case 365:
      return "Last 12 months";
    default:
      return `Last ${days} days`;
  }
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(weekStart: Date): string {
  return weekStart.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
  });
}

function effectiveReceived(
  quantityReceived: number,
  quantityOnHand: number,
  quantitySold: number,
): number {
  if (quantityReceived > 0) return quantityReceived;
  return quantityOnHand + quantitySold;
}

function buildReceiveRow(
  batch: {
    id: string;
    receivedAt: Date;
    batchNumber: string | null;
    supplierName: string | null;
    quantityOnHand: number;
    quantityReceived: number;
    stockUnit: StockUnitCode;
    unitsPerPack: number | null;
    supplierCost: { toString(): string } | null;
    retailSalePrice: { toString(): string } | null;
    medicine: {
      genericName: string;
      dosageForm: string;
      strength: string;
    };
  },
  soldQty: number,
  revenue: number,
): ReceiveHistoryRow {
  const received = effectiveReceived(
    batch.quantityReceived,
    batch.quantityOnHand,
    soldQty,
  );
  const supplierCost = batch.supplierCost
    ? decimalToNumber(batch.supplierCost)
    : null;
  const retailSalePrice = batch.retailSalePrice
    ? decimalToNumber(batch.retailSalePrice)
    : null;
  const sellThroughPercent =
    received > 0 ? Math.round((soldQty / received) * 100) : 0;
  const receiveCostTotal =
    supplierCost !== null
      ? Math.round(supplierCost * received * 100) / 100
      : null;
  const costOfGoodsSold =
    supplierCost !== null
      ? Math.round(supplierCost * soldQty * 100) / 100
      : null;
  const grossMargin =
    costOfGoodsSold !== null
      ? Math.round((revenue - costOfGoodsSold) * 100) / 100
      : null;

  return {
    batchId: batch.id,
    receivedAt: batch.receivedAt.toISOString(),
    genericName: batch.medicine.genericName,
    dosageForm: batch.medicine.dosageForm,
    strength: batch.medicine.strength,
    batchNumber: batch.batchNumber,
    supplierName: batch.supplierName,
    stockUnit: batch.stockUnit,
    unitsPerPack: batch.unitsPerPack,
    quantityReceived: received,
    quantityOnHand: batch.quantityOnHand,
    quantitySold: soldQty,
    sellThroughPercent,
    supplierCost,
    retailSalePrice,
    receiveCostTotal,
    revenueFromBatch: revenue,
    costOfGoodsSold,
    grossMargin,
  };
}

export async function getStockingInsights(
  periodDays: InsightsPeriodDays = 30,
): Promise<ActionResult<StockingInsightsData>> {
  const ctx = await requireTenantContext("insights.view");
  return runAction(
    "getStockingInsights",
    async () => {
      const { db } = ctx;
      const since = daysAgo(periodDays);

      const batches = await db.stockBatch.findMany({
        where: { receivedAt: { gte: since } },
        include: {
          medicine: {
            select: { genericName: true, dosageForm: true, strength: true },
          },
        },
        orderBy: { receivedAt: "desc" },
      });

      const batchIds = batches.map((b) => b.id);

      const salesAgg =
        batchIds.length > 0
          ? await db.saleLine.groupBy({
              by: ["stockBatchId"],
              where: {
                stockBatchId: { in: batchIds },
                status: "ACTIVE",
              },
              _sum: { quantity: true, lineTotal: true },
            })
          : [];

      const soldMap = new Map<string, { quantity: number; revenue: number }>();
      for (const row of salesAgg) {
        soldMap.set(row.stockBatchId, {
          quantity: row._sum.quantity ?? 0,
          revenue: decimalToNumber(row._sum.lineTotal ?? 0),
        });
      }

      const receiveHistory: ReceiveHistoryRow[] = batches.map((batch) => {
        const sold = soldMap.get(batch.id) ?? { quantity: 0, revenue: 0 };
        return buildReceiveRow(
          {
            ...batch,
            stockUnit: batch.stockUnit as StockUnitCode,
          },
          sold.quantity,
          sold.revenue,
        );
      });

      let unitsReceived = 0;
      let receiveCostValue = 0;
      let unitsSold = 0;
      let revenue = 0;
      let grossMarginSum = 0;
      let marginRows = 0;
      const medicineSet = new Set<string>();

      for (const row of receiveHistory) {
        unitsReceived += row.quantityReceived;
        unitsSold += row.quantitySold;
        revenue += row.revenueFromBatch;
        if (row.receiveCostTotal !== null) {
          receiveCostValue += row.receiveCostTotal;
        }
        if (row.grossMargin !== null) {
          grossMarginSum += row.grossMargin;
          marginRows++;
        }
        medicineSet.add(row.genericName);
      }

      const sellThroughPercent =
        unitsReceived > 0 ? Math.round((unitsSold / unitsReceived) * 100) : 0;

      const weekMap = new Map<string, WeeklyStockingBucket>();

      for (const row of receiveHistory) {
        const weekStart = startOfWeek(new Date(row.receivedAt));
        const key = weekStart.toISOString().slice(0, 10);
        const existing = weekMap.get(key) ?? {
          weekStart: key,
          label: formatWeekLabel(weekStart),
          receiveCount: 0,
          unitsReceived: 0,
          receiveCost: 0,
          unitsSold: 0,
          revenue: 0,
        };
        existing.receiveCount += 1;
        existing.unitsReceived += row.quantityReceived;
        existing.unitsSold += row.quantitySold;
        existing.revenue += row.revenueFromBatch;
        if (row.receiveCostTotal !== null) {
          existing.receiveCost += row.receiveCostTotal;
        }
        weekMap.set(key, existing);
      }

      const weeklyTrend = Array.from(weekMap.values()).sort((a, b) =>
        a.weekStart.localeCompare(b.weekStart),
      );

      const restockMap = new Map<string, TopRestockedItem>();
      for (const row of receiveHistory) {
        const key = `${row.genericName}:${row.stockUnit}`;
        const existing = restockMap.get(key) ?? {
          genericName: row.genericName,
          stockUnit: row.stockUnit,
          receiveCount: 0,
          unitsReceived: 0,
          unitsSold: 0,
        };
        existing.receiveCount += 1;
        existing.unitsReceived += row.quantityReceived;
        existing.unitsSold += row.quantitySold;
        restockMap.set(key, existing);
      }

      const topRestocked = Array.from(restockMap.values())
        .sort(
          (a, b) =>
            b.receiveCount - a.receiveCount ||
            b.unitsReceived - a.unitsReceived,
        )
        .slice(0, 10);

      const twoWeeksAgo = daysAgo(14);
      const slowMovers = receiveHistory
        .filter(
          (row) =>
            new Date(row.receivedAt) <= twoWeeksAgo &&
            row.sellThroughPercent < 25 &&
            row.quantityOnHand > 0,
        )
        .sort((a, b) => a.sellThroughPercent - b.sellThroughPercent)
        .slice(0, 10);

      return {
        periodDays,
        periodLabel: periodLabel(periodDays),
        summary: {
          receiveEvents: receiveHistory.length,
          unitsReceived,
          receiveCostValue: Math.round(receiveCostValue * 100) / 100,
          unitsSold,
          revenue: Math.round(revenue * 100) / 100,
          grossMargin:
            marginRows > 0
              ? Math.round(grossMarginSum * 100) / 100
              : null,
          sellThroughPercent,
          distinctMedicines: medicineSet.size,
        },
        weeklyTrend,
        receiveHistory,
        topRestocked,
        slowMovers,
      };
  },
    { tenantId: ctx.tenantId },
  );
}
