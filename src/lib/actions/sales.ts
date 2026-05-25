"use server";

import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/money";
import type {
  ActionResult,
  SalesDashboardData,
  SaleLineView,
  SaleSummary,
  TodaySalesMetrics,
  TopSellingDrug,
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

function mapSaleLine(
  line: {
    id: string;
    saleId: string;
    genericName: string;
    dosageForm: string;
    strength: string;
    quantity: number;
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
    batchNumber: line.stockBatch.batchNumber,
    quantity: line.quantity,
    unitPrice: decimalToNumber(line.unitPrice),
    lineTotal: decimalToNumber(line.lineTotal),
    status: line.status,
    correctionNote: line.correctionNote,
    createdAt: line.createdAt.toISOString(),
  };
}

async function getTodayMetrics(from: Date): Promise<TodaySalesMetrics> {
  const sales = await prisma.sale.findMany({
    where: { createdAt: { gte: from } },
    include: { lines: true },
  });

  let unitsSold = 0;
  let grossRevenue = 0;
  let lineCount = 0;
  let voidedLines = 0;

  for (const sale of sales) {
    for (const line of sale.lines) {
      lineCount++;
      if (line.status === "VOIDED") {
        voidedLines++;
        continue;
      }
      unitsSold += line.quantity;
      grossRevenue += decimalToNumber(line.lineTotal);
    }
  }

  return {
    saleCount: sales.length,
    lineCount,
    unitsSold,
    grossRevenue,
    voidedLines,
  };
}

async function getTopDrugs(
  from: Date,
  limit: number,
): Promise<TopSellingDrug[]> {
  const lines = await prisma.saleLine.findMany({
    where: {
      status: "ACTIVE",
      createdAt: { gte: from },
    },
    include: {
      medicine: {
        select: { id: true, genericName: true, dosageForm: true, strength: true },
      },
    },
  });

  const map = new Map<string, TopSellingDrug>();

  for (const line of lines) {
    const key = line.medicineId;
    const existing = map.get(key);
    const revenue = decimalToNumber(line.lineTotal);

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
        unitsSold: line.quantity,
        revenue,
        dispenseCount: 1,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue)
    .slice(0, limit)
    .map(({ medicineId, genericName, dosageForm, strength, unitsSold, revenue, dispenseCount }) => ({
      medicineId,
      genericName,
      dosageForm,
      strength,
      unitsSold,
      revenue,
      dispenseCount,
    }));
}

export async function getSalesDashboard(): Promise<
  ActionResult<SalesDashboardData>
> {
  return runAction("getSalesDashboard", async () => {
    const todayStart = startOfToday();
    const weekStart = daysAgo(7);

    const salesToday = await prisma.sale.findMany({
      where: { createdAt: { gte: todayStart } },
      include: {
        lines: {
          include: { stockBatch: { select: { batchNumber: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const todaySales: SaleSummary[] = salesToday.map((sale) => {
      const lines = sale.lines.map(mapSaleLine);
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
      today: await getTodayMetrics(todayStart),
      todaySales,
      topDrugsToday: await getTopDrugs(todayStart, 10),
      topDrugs7Days: await getTopDrugs(weekStart, 15),
    };
  });
}
