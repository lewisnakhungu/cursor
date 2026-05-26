"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/auth/guards";
import { decimalToNumber } from "@/lib/money";
import { InsufficientStockError, AppError } from "@/lib/errors";
import type { StockUnitCode } from "@/lib/stock-unit";
import type { ActionResult, CartDispenseItem, DispenseResult } from "@/lib/types";
import { runAction } from "@/lib/actions/utils";

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export async function dispenseMedicine(
  cartItems: CartDispenseItem[],
): Promise<ActionResult<DispenseResult>> {
  const ctx = await requireTenantContext("dispense.sale");
  return runAction(
    "dispenseMedicine",
    async () => {
      const { tenantId, db } = ctx;
      if (cartItems.length === 0) {
        throw new InsufficientStockError("Cart is empty");
      }

      const today = startOfToday();

      // Use base prisma.$transaction (not tenant-extended db.$transaction).
      // Prisma query extensions can run outside the interactive tx and write wrong tenantId.
      const saleId = await prisma.$transaction(
        async (tx) => {
          const sale = await tx.sale.create({
            data: { tenantId, totalAmount: 0 },
          });
          let saleTotal = new Prisma.Decimal(0);

          for (const item of cartItems) {
            if (item.quantity <= 0) {
              throw new InsufficientStockError("Invalid quantity in cart");
            }

            const medicine = await prisma.medicine.findUnique({
              where: { id: item.medicineId },
              select: {
                id: true,
                genericName: true,
                dosageForm: true,
                strength: true,
              },
            });

            if (!medicine) {
              throw new InsufficientStockError("Medicine not found");
            }

            let remaining = item.quantity;

            const batches = await tx.$queryRaw<
              Array<{
                id: string;
                quantityOnHand: number;
                retailSalePrice: Prisma.Decimal | null;
                stockUnit: StockUnitCode;
                unitsPerPack: number | null;
              }>
            >(
              item.stockBatchId
                ? Prisma.sql`
                    SELECT id, "quantityOnHand", "retailSalePrice", "stockUnit", "unitsPerPack"
                    FROM stock_batches
                    WHERE id = ${item.stockBatchId}
                      AND "tenantId" = ${tenantId}
                      AND "medicineId" = ${item.medicineId}
                      AND "quantityOnHand" > 0
                      AND "expiryDate" >= ${today}::date
                    FOR UPDATE
                  `
                : Prisma.sql`
                    SELECT id, "quantityOnHand", "retailSalePrice", "stockUnit", "unitsPerPack"
                    FROM stock_batches
                    WHERE "tenantId" = ${tenantId}
                      AND "medicineId" = ${item.medicineId}
                      AND "quantityOnHand" > 0
                      AND "expiryDate" >= ${today}::date
                    ORDER BY "expiryDate" ASC, "receivedAt" ASC
                    FOR UPDATE
                  `,
            );

            for (const batch of batches) {
              if (remaining <= 0) break;

              const take = Math.min(batch.quantityOnHand, remaining);
              if (take <= 0) continue;

              const updated = await tx.stockBatch.updateMany({
                where: {
                  id: batch.id,
                  tenantId,
                  quantityOnHand: { gte: take },
                },
                data: {
                  quantityOnHand: { decrement: take },
                },
              });

              if (updated.count !== 1) {
                throw new InsufficientStockError(
                  `Concurrent stock conflict for batch ${batch.id}`,
                );
              }

              const unitPrice =
                batch.retailSalePrice ?? new Prisma.Decimal(0);
              const lineTotal = unitPrice.mul(take);

              await tx.saleLine.create({
                data: {
                  tenantId,
                  saleId: sale.id,
                  medicineId: medicine.id,
                  stockBatchId: batch.id,
                  quantity: take,
                  unitPrice,
                  lineTotal,
                  status: "ACTIVE",
                  genericName: medicine.genericName,
                  dosageForm: medicine.dosageForm,
                  strength: medicine.strength,
                  stockUnit: batch.stockUnit,
                  unitsPerPack: batch.unitsPerPack,
                },
              });

              saleTotal = saleTotal.add(lineTotal);
              remaining -= take;
            }

            if (remaining > 0) {
              throw new InsufficientStockError(
                `Insufficient stock for ${medicine.genericName}`,
              );
            }
          }

          await tx.sale.update({
            where: { id: sale.id },
            data: { totalAmount: saleTotal },
          });

          return sale.id;
        },
        {
          // ReadCommitted + FOR UPDATE row locks; Serializable often fails on Neon/serverless.
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );

      const sale = await db.sale.findUnique({
        where: { id: saleId },
        include: {
          lines: {
            include: {
              stockBatch: { select: { batchNumber: true } },
            },
            orderBy: { id: "asc" },
          },
        },
      });

      if (!sale) {
        throw new InsufficientStockError("Sale record missing after dispense");
      }

      const activeLines = sale.lines.filter((l) => l.status === "ACTIVE");

      return {
        saleId: sale.id,
        createdAt: sale.createdAt.toISOString(),
        lineCount: activeLines.length,
        totalAmount: decimalToNumber(sale.totalAmount),
        lines: sale.lines.map((line) => ({
          id: line.id,
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
        })),
      };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function correctSaleLine(
  input: import("@/lib/types").CorrectSaleLineInput,
): Promise<ActionResult<{ saleId: string }>> {
  const ctx = await requireTenantContext("dispense.sale");
  return runAction(
    "correctSaleLine",
    async () => {
      const reason = input.reason.trim();
      if (reason.length < 3) {
        throw new AppError(
          "Correction reason is required (audit trail)",
          "VALIDATION",
        );
      }

      if (input.newQuantity < 0) {
        throw new AppError("Quantity cannot be negative", "VALIDATION");
      }

      const { tenantId } = ctx;
      const saleId = await prisma.$transaction(
        async (tx) => {
          const line = await tx.saleLine.findFirst({
            where: { id: input.saleLineId, tenantId },
            include: { sale: true },
          });

          if (!line || line.status !== "ACTIVE") {
            throw new AppError(
              "Sale line not found or already voided",
              "NOT_FOUND",
            );
          }

          const delta = input.newQuantity - line.quantity;

          if (delta > 0) {
            const batch = await tx.stockBatch.findFirst({
              where: { id: line.stockBatchId, tenantId },
            });
            if (!batch || batch.quantityOnHand < delta) {
              throw new InsufficientStockError(
                "Not enough stock to increase dispensed quantity",
              );
            }
            await tx.stockBatch.updateMany({
              where: { id: line.stockBatchId, tenantId },
              data: { quantityOnHand: { decrement: delta } },
            });
          } else if (delta < 0) {
            await tx.stockBatch.updateMany({
              where: { id: line.stockBatchId, tenantId },
              data: { quantityOnHand: { increment: Math.abs(delta) } },
            });
          }

          if (input.newQuantity === 0) {
            await tx.saleLine.updateMany({
              where: { id: line.id, tenantId },
              data: {
                status: "VOIDED",
                quantity: 0,
                lineTotal: 0,
                correctionNote: reason,
              },
            });
          } else {
            const lineTotal = line.unitPrice.mul(input.newQuantity);
            await tx.saleLine.updateMany({
              where: { id: line.id, tenantId },
              data: {
                quantity: input.newQuantity,
                lineTotal,
                correctionNote: reason,
              },
            });
          }

          const activeLines = await tx.saleLine.findMany({
            where: { saleId: line.saleId, tenantId, status: "ACTIVE" },
          });

          const newTotal = activeLines.reduce(
            (sum, activeLine) => sum.add(activeLine.lineTotal),
            new Prisma.Decimal(0),
          );

          await tx.sale.updateMany({
            where: { id: line.saleId, tenantId },
            data: { totalAmount: newTotal },
          });

          return line.saleId;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );

      return { saleId };
    },
    { tenantId: ctx.tenantId },
  );
}
