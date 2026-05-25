"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/money";
import { InsufficientStockError, AppError } from "@/lib/errors";
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
  return runAction("dispenseMedicine", async () => {
    if (cartItems.length === 0) {
      throw new InsufficientStockError("Cart is empty");
    }

    const today = startOfToday();

    const saleId = await prisma.$transaction(
      async (tx) => {
        const sale = await tx.sale.create({ data: { totalAmount: 0 } });
        let saleTotal = new Prisma.Decimal(0);

        for (const item of cartItems) {
          if (item.quantity <= 0) {
            throw new InsufficientStockError("Invalid quantity in cart");
          }

          const medicine = await tx.medicine.findUnique({
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
            }>
          >(
            item.stockBatchId
              ? Prisma.sql`
                  SELECT id, "quantityOnHand", "retailSalePrice"
                  FROM stock_batches
                  WHERE id = ${item.stockBatchId}
                    AND "medicineId" = ${item.medicineId}
                    AND "quantityOnHand" > 0
                    AND "expiryDate" >= ${today}::date
                  FOR UPDATE
                `
              : Prisma.sql`
                  SELECT id, "quantityOnHand", "retailSalePrice"
                  FROM stock_batches
                  WHERE "medicineId" = ${item.medicineId}
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
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    const sale = await prisma.sale.findUnique({
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
        unitPrice: decimalToNumber(line.unitPrice),
        lineTotal: decimalToNumber(line.lineTotal),
        status: line.status,
      })),
    };
  });
}

export async function correctSaleLine(
  input: import("@/lib/types").CorrectSaleLineInput,
): Promise<ActionResult<{ saleId: string }>> {
  return runAction("correctSaleLine", async () => {
    const reason = input.reason.trim();
    if (reason.length < 3) {
      throw new AppError("Correction reason is required (audit trail)", "VALIDATION");
    }

    if (input.newQuantity < 0) {
      throw new AppError("Quantity cannot be negative", "VALIDATION");
    }

    const saleId = await prisma.$transaction(
      async (tx) => {
        const line = await tx.saleLine.findUnique({
          where: { id: input.saleLineId },
          include: { sale: true },
        });

        if (!line || line.status !== "ACTIVE") {
          throw new AppError("Sale line not found or already voided", "NOT_FOUND");
        }

        const delta = input.newQuantity - line.quantity;

        if (delta > 0) {
          const batch = await tx.stockBatch.findUnique({
            where: { id: line.stockBatchId },
          });
          if (!batch || batch.quantityOnHand < delta) {
            throw new InsufficientStockError(
              "Not enough stock to increase dispensed quantity",
            );
          }
          await tx.stockBatch.update({
            where: { id: line.stockBatchId },
            data: { quantityOnHand: { decrement: delta } },
          });
        } else if (delta < 0) {
          await tx.stockBatch.update({
            where: { id: line.stockBatchId },
            data: { quantityOnHand: { increment: Math.abs(delta) } },
          });
        }

        if (input.newQuantity === 0) {
          await tx.saleLine.update({
            where: { id: line.id },
            data: {
              status: "VOIDED",
              quantity: 0,
              lineTotal: 0,
              correctionNote: reason,
            },
          });
        } else {
          const lineTotal = line.unitPrice.mul(input.newQuantity);
          await tx.saleLine.update({
            where: { id: line.id },
            data: {
              quantity: input.newQuantity,
              lineTotal,
              correctionNote: reason,
            },
          });
        }

        const activeLines = await tx.saleLine.findMany({
          where: { saleId: line.saleId, status: "ACTIVE" },
        });

        const newTotal = activeLines.reduce(
          (sum, activeLine) => sum.add(activeLine.lineTotal),
          new Prisma.Decimal(0),
        );

        await tx.sale.update({
          where: { id: line.saleId },
          data: { totalAmount: newTotal },
        });

        return line.saleId;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    return { saleId };
  });
}
