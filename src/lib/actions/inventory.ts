"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  isStockUnitCode,
  stockUnitOptionSupportsPackSize,
  type StockUnitCode,
} from "@/lib/stock-unit";
import { decimalToNumber } from "@/lib/money";
import type {
  ActionResult,
  ExpiringStockReport,
  ReceiveInventoryInput,
  StockBatchRow,
} from "@/lib/types";
import { runAction } from "@/lib/actions/utils";

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
  return runAction("receiveInventory", async () => {
    if (batchData.quantityOnHand <= 0) {
      throw new AppError("Quantity must be greater than zero", "VALIDATION");
    }

    if (!isStockUnitCode(batchData.stockUnit)) {
      throw new AppError("Invalid stock counting unit", "VALIDATION");
    }

    const expiryDate = new Date(batchData.expiryDate);
    if (Number.isNaN(expiryDate.getTime())) {
      throw new AppError("Invalid expiry date", "VALIDATION");
    }

    if (
      batchData.supplierCost !== undefined &&
      batchData.supplierCost < 0
    ) {
      throw new AppError("Supplier cost cannot be negative", "VALIDATION");
    }

    if (
      batchData.retailSalePrice !== undefined &&
      batchData.retailSalePrice < 0
    ) {
      throw new AppError("Retail price cannot be negative", "VALIDATION");
    }

    let unitsPerPack: number | null = null;
    if (batchData.unitsPerPack !== undefined) {
      if (
        !Number.isInteger(batchData.unitsPerPack) ||
        batchData.unitsPerPack < 2
      ) {
        throw new AppError(
          "Pack size must be a whole number of 2 or more (e.g. 100 tablets per box)",
          "VALIDATION",
        );
      }
      unitsPerPack = batchData.unitsPerPack;
    } else if (stockUnitOptionSupportsPackSize(batchData.stockUnit)) {
      unitsPerPack = null;
    }

    const medicine = await prisma.medicine.findUnique({
      where: { id: batchData.medicineId },
      select: { id: true },
    });

    if (!medicine) {
      throw new AppError("Medicine not found in catalog", "NOT_FOUND");
    }

    const batch = await prisma.stockBatch.create({
      data: {
        medicineId: batchData.medicineId,
        batchNumber: batchData.batchNumber?.trim() || null,
        supplierName: batchData.supplierName?.trim() || null,
        quantityOnHand: batchData.quantityOnHand,
        quantityReceived: batchData.quantityOnHand,
        expiryDate,
        stockUnit: batchData.stockUnit,
        unitsPerPack,
        supplierCost:
          batchData.supplierCost !== undefined
            ? new Prisma.Decimal(batchData.supplierCost)
            : null,
        retailSalePrice:
          batchData.retailSalePrice !== undefined
            ? new Prisma.Decimal(batchData.retailSalePrice)
            : null,
      },
      select: { id: true },
    });

    return { batchId: batch.id };
  });
}

export async function getExpiringStock(): Promise<
  ActionResult<ExpiringStockReport>
> {
  return runAction("getExpiringStock", async () => {
    const today = startOfToday();

    const batches = await prisma.stockBatch.findMany({
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
  });
}
