"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/auth/guards";
import { AppError } from "@/lib/errors";
import type { StockUnitCode } from "@/lib/stock-unit";
import { decimalToNumber } from "@/lib/money";
import type {
  ActionResult,
  BulkReceiveResult,
  ExpiringStockReport,
  InventoryBatchItem,
  InventoryMedicineRow,
  InventoryOverviewData,
  ReceiveInventoryInput,
  StockBatchRow,
  ValidatedInventoryItem,
} from "@/lib/types";
import { runAction } from "@/lib/actions/utils";
import { recordProcurementReceipt } from "@/lib/actions/procurement";
import {
  bulkReceiveInventorySchema,
  parseInput,
  receiveInventorySchema,
} from "@/lib/validation";

const EXPIRY_WARNING_DAYS = 90;
const LOW_STOCK_THRESHOLD = 10;

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function daysUntilExpiry(expiryDate: Date): number {
  const today = startOfToday();
  const msPerDay = 86_400_000;
  return Math.ceil((expiryDate.getTime() - today.getTime()) / msPerDay);
}

function mapBatchRow(
  batch: {
    id: string;
    medicineId: string;
    batchNumber: string | null;
    quantityOnHand: number;
    expiryDate: Date;
    stockUnit: StockUnitCode;
    unitsPerPack: number | null;
    retailSalePrice: { toString(): string } | null;
    medicine: {
      genericName: string;
      dosageForm: string;
      strength: string;
    };
  },
): StockBatchRow {
  const days = daysUntilExpiry(batch.expiryDate);
  return {
    id: batch.id,
    medicineId: batch.medicineId,
    genericName: batch.medicine.genericName,
    dosageForm: batch.medicine.dosageForm,
    strength: batch.medicine.strength,
    batchNumber: batch.batchNumber,
    quantityOnHand: batch.quantityOnHand,
    expiryDate: batch.expiryDate.toISOString().slice(0, 10),
    daysUntilExpiry: days,
    isLowStock: batch.quantityOnHand <= LOW_STOCK_THRESHOLD,
    isExpiringSoon: days >= 0 && days <= EXPIRY_WARNING_DAYS,
    stockUnit: batch.stockUnit,
    unitsPerPack: batch.unitsPerPack,
    retailSalePrice: batch.retailSalePrice
      ? decimalToNumber(batch.retailSalePrice)
      : null,
  };
}

export async function receiveInventory(
  batchData: ReceiveInventoryInput,
): Promise<ActionResult<{ batchId: string }>> {
  const ctx = await requireTenantContext("receive.stock");
  return runAction("receiveInventory", async () => {
    const { db } = ctx;
    const data = parseInput(receiveInventorySchema, batchData);

    const expiryDate = new Date(data.expiryDate);
    const unitsPerPack = data.unitsPerPack ?? null;

    const medicine = await prisma.medicine.findUnique({
      where: { id: data.medicineId },
      select: { id: true },
    });

    if (!medicine) {
      throw new AppError("Medicine not found in catalog", "NOT_FOUND");
    }

    const batch = await db.stockBatch.create({
      data: {
        tenantId: ctx.tenantId,
        medicineId: data.medicineId,
        batchNumber: data.batchNumber?.trim() || null,
        supplierName: data.supplierName?.trim() || null,
        quantityOnHand: data.quantityOnHand,
        quantityReceived: data.quantityOnHand,
        expiryDate,
        stockUnit: data.stockUnit,
        unitsPerPack,
        supplierCost:
          data.supplierCost !== undefined
            ? new Prisma.Decimal(data.supplierCost)
            : null,
        retailSalePrice:
          data.retailSalePrice !== undefined
            ? new Prisma.Decimal(data.retailSalePrice)
            : null,
        procurementOrderId: data.procurementOrderId ?? null,
        procurementLineId: data.procurementLineId ?? null,
        receivedById: ctx.session.userId,
      },
      select: { id: true },
    });

    if (data.procurementLineId) {
      await recordProcurementReceipt(
        db,
        data.procurementLineId,
        data.quantityOnHand,
      );
    }

    return { batchId: batch.id };
  }, { tenantId: ctx.tenantId });
}

export async function receiveBulkInventory(
  items: ValidatedInventoryItem[],
): Promise<ActionResult<BulkReceiveResult>> {
  const ctx = await requireTenantContext("receive.stock");
  return runAction(
    "receiveBulkInventory",
    async () => {
      const validated = parseInput(bulkReceiveInventorySchema, items);

      const medicineIds = Array.from(
        new Set(validated.map((item) => item.medicineId)),
      );
      const found = await prisma.medicine.count({
        where: { id: { in: medicineIds }, isStub: false },
      });
      if (found !== medicineIds.length) {
        throw new AppError(
          "One or more medicines were not found in the catalog",
          "NOT_FOUND",
        );
      }

      await ctx.transaction(async (tx) => {
        for (const data of validated) {
          const expiryDate = new Date(data.expiryDate);
          await tx.stockBatch.create({
            data: {
              tenantId: ctx.tenantId,
              medicineId: data.medicineId,
              batchNumber: data.batchNumber?.trim() || null,
              supplierName: data.supplierName?.trim() || null,
              quantityOnHand: data.quantityOnHand,
              quantityReceived: data.quantityOnHand,
              expiryDate,
              stockUnit: data.stockUnit,
              unitsPerPack: data.unitsPerPack ?? null,
              supplierCost:
                data.supplierCost !== undefined
                  ? new Prisma.Decimal(data.supplierCost)
                  : null,
              retailSalePrice:
                data.retailSalePrice !== undefined
                  ? new Prisma.Decimal(data.retailSalePrice)
                  : null,
              receivedById: ctx.session.userId,
            },
          });
        }
      });

      return { count: validated.length };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function getExpiringStock(): Promise<
  ActionResult<ExpiringStockReport>
> {
  const ctx = await requireTenantContext("dashboard.view");
  return runAction("getExpiringStock", async () => {
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
          },
        },
      },
      orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
    });

    const activeBatches = batches.map(mapBatchRow);
    const expiringWithin90Days = activeBatches
      .filter((row) => row.isExpiringSoon)
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    return {
      hasExpiryWarning: expiringWithin90Days.length > 0,
      expiringWithin90Days,
      activeBatches,
      lowStockCount: activeBatches.filter((row) => row.isLowStock).length,
    };
  }, { tenantId: ctx.tenantId });
}

export async function getInventoryOverview(): Promise<
  ActionResult<InventoryOverviewData>
> {
  const ctx = await requireTenantContext("dashboard.view");
  return runAction("getInventoryOverview", async () => {
    const { db } = ctx;

    const batches = await db.stockBatch.findMany({
      where: {
        quantityOnHand: { gt: 0 },
      },
      include: {
        medicine: {
          select: {
            id: true,
            genericName: true,
            dosageForm: true,
            strength: true,
            category: true,
          },
        },
      },
      orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
    });

    const medicineMap = new Map<string, InventoryMedicineRow>();

    let totalLowStock = 0;
    let totalExpiringSoon = 0;
    let totalCritical = 0;
    let totalUnits = 0;

    for (const batch of batches) {
      const days = daysUntilExpiry(batch.expiryDate);
      const price = batch.retailSalePrice ? decimalToNumber(batch.retailSalePrice) : null;
      totalUnits += batch.quantityOnHand;

      const batchItem: InventoryBatchItem = {
        id: batch.id,
        batchNumber: batch.batchNumber,
        quantityOnHand: batch.quantityOnHand,
        expiryDate: batch.expiryDate.toISOString().slice(0, 10),
        daysUntilExpiry: days,
        retailSalePrice: price,
        stockUnit: batch.stockUnit,
        unitsPerPack: batch.unitsPerPack,
        isFefoPriority: false,
      };

      const existing = medicineMap.get(batch.medicineId);
      if (existing) {
        existing.totalOnHand += batch.quantityOnHand;
        existing.batchCount += 1;
        existing.batches.push(batchItem);
      } else {
        medicineMap.set(batch.medicineId, {
          id: batch.medicine.id,
          genericName: batch.medicine.genericName,
          dosageForm: batch.medicine.dosageForm,
          strength: batch.medicine.strength,
          category: batch.medicine.category,
          totalOnHand: batch.quantityOnHand,
          stockUnit: batch.stockUnit,
          unitsPerPack: batch.unitsPerPack,
          batchCount: 1,
          status: "HEALTHY",
          statusLabel: "Healthy",
          earliestExpiry: batch.expiryDate.toISOString().slice(0, 10),
          daysUntilEarliestExpiry: days,
          batches: [batchItem],
        });
      }
    }

    const medicines = Array.from(medicineMap.values()).map((med) => {
      if (med.batches.length > 0) {
        med.batches[0].isFefoPriority = true;
      }

      const earliestDays = med.daysUntilEarliestExpiry ?? 999;
      if (earliestDays < 0) {
        med.status = "EXPIRED";
        med.statusLabel = "Expired";
      } else if (earliestDays <= 30) {
        med.status = "CRITICAL";
        med.statusLabel = "Critical expiry";
        totalCritical += 1;
      } else if (earliestDays <= 90) {
        med.status = "EXPIRING";
        med.statusLabel = "Expiring soon";
        totalExpiringSoon += 1;
      } else if (med.totalOnHand <= LOW_STOCK_THRESHOLD) {
        med.status = "LOW_STOCK";
        med.statusLabel = "Low stock";
        totalLowStock += 1;
      } else {
        med.status = "HEALTHY";
        med.statusLabel = "Healthy";
      }

      return med;
    });

    return {
      medicines,
      totalMedicines: medicines.length,
      totalActiveBatches: batches.length,
      totalLowStock,
      totalExpiringSoon,
      totalCritical,
      totalUnits,
    };
  }, { tenantId: ctx.tenantId });
}

export async function getMedicineStockMovements(medicineId: string): Promise<
  ActionResult<Array<{
    id: string;
    type: string;
    quantityDelta: number;
    balanceAfter: number;
    referenceType: string;
    reason: string | null;
    createdAt: string;
  }>>
> {
  const ctx = await requireTenantContext("dashboard.view");
  return runAction("getMedicineStockMovements", async () => {
    const { db } = ctx;
    const movements = await db.stockMovement.findMany({
      where: {
        stockBatch: { medicineId },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        type: true,
        quantityDelta: true,
        balanceAfter: true,
        referenceType: true,
        reason: true,
        createdAt: true,
      },
    });

    return movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantityDelta: m.quantityDelta,
      balanceAfter: m.balanceAfter,
      referenceType: m.referenceType,
      reason: m.reason,
      createdAt: m.createdAt.toISOString(),
    }));
  }, { tenantId: ctx.tenantId });
}

