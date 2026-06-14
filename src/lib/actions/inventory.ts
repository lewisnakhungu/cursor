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
  ReceiveInventoryInput,
  StockBatchRow,
  ValidatedInventoryItem,
} from "@/lib/types";
import { runAction } from "@/lib/actions/utils";
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
      },
      select: { id: true },
    });

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
      const { db } = ctx;
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

      await db.$transaction(async (tx) => {
        for (const data of validated) {
          const expiryDate = new Date(data.expiryDate);
          await tx.stockBatch.create({
            data: {
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
