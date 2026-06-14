"use server";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/auth/guards";
import { AppError } from "@/lib/errors";
import { runAction } from "@/lib/actions/utils";
import { parseInput } from "@/lib/validation";
import {
  addProcurementLineSchema,
  bulkImportProcurementLinesSchema,
  createProcurementDraftSchema,
  generateReorderDraftSchema,
  submitProcurementOrderSchema,
  updateProcurementOrderSchema,
} from "@/lib/validation-procurement";
import { buildAbcRankMap } from "@/lib/procurement/abc-classify";
import {
  computeAvgDailySales,
  computeDaysOfStockLeft,
  computeReorderPoint,
  computeSuggestedQty,
  computeTargetLevel,
  defaultPolicy,
  EXPIRY_WATCH_DAYS,
  SALES_LOOKBACK_DAYS,
  type LineSourceMeta,
  type ReorderPolicyInput,
} from "@/lib/procurement/reorder-suggest";
import type { StockUnitCode } from "@/lib/stock-unit";
import type {
  ActionResult,
  ProcurementExpiryWatchRow,
  ProcurementLineSourceMeta,
  ProcurementOrderDetail,
  ProcurementOrderLineView,
  ProcurementOrderSummary,
  ProcurementReportData,
  ProcurementReorderCount,
} from "@/lib/types";
import { getActiveFacilityName } from "@/lib/auth/session-types";

const FACILITY_NAME =
  process.env.NEXT_PUBLIC_FACILITY_NAME ?? "AfyaSmart Facility";

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

function daysUntilExpiry(expiryDate: Date): number {
  const msPerDay = 86_400_000;
  return Math.ceil((expiryDate.getTime() - startOfToday().getTime()) / msPerDay);
}

async function nextReference(
  db: { procurementOrder: { count: (args: unknown) => Promise<number> } },
): Promise<string> {
  const today = startOfToday();
  const datePart = today.toISOString().slice(0, 10).replace(/-/g, "");
  const count = await db.procurementOrder.count({
    where: { createdAt: { gte: today } },
  });
  return `REQ-${datePart}-${String(count + 1).padStart(3, "0")}`;
}

function parseSourceMeta(raw: unknown): ProcurementLineSourceMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.currentStock !== "number") return null;
  return {
    currentStock: m.currentStock as number,
    reorderPoint: m.reorderPoint as number,
    targetLevel: m.targetLevel as number,
    avgDailySales: m.avgDailySales as number,
    daysOfStockLeft:
      m.daysOfStockLeft === null || typeof m.daysOfStockLeft === "number"
        ? (m.daysOfStockLeft as number | null)
        : null,
    abcClass:
      m.abcClass === "A" || m.abcClass === "B" || m.abcClass === "C"
        ? m.abcClass
        : undefined,
  };
}

function mapLineView(
  line: {
    id: string;
    medicineId: string;
    suggestedQty: number;
    orderedQty: number;
    receivedQty: number;
    stockUnit: StockUnitCode;
    unitsPerPack: number | null;
    reason: "LOW_STOCK" | "MANUAL" | "NEW_ITEM";
    priority: string;
    notes: string | null;
    sourceMeta: unknown;
    sortOrder: number;
    medicine: {
      genericName: string;
      dosageForm: string;
      strength: string;
    };
  },
): ProcurementOrderLineView {
  return {
    id: line.id,
    medicineId: line.medicineId,
    genericName: line.medicine.genericName,
    dosageForm: line.medicine.dosageForm,
    strength: line.medicine.strength,
    suggestedQty: line.suggestedQty,
    orderedQty: line.orderedQty,
    receivedQty: line.receivedQty,
    stockUnit: line.stockUnit,
    unitsPerPack: line.unitsPerPack,
    reason: line.reason,
    priority: line.priority,
    notes: line.notes,
    sourceMeta: parseSourceMeta(line.sourceMeta),
    sortOrder: line.sortOrder,
  };
}

type StockRow = {
  medicineId: string;
  quantityOnHand: number;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
  expiryDate: Date;
  batchNumber: string | null;
  id: string;
  medicine: {
    genericName: string;
    dosageForm: string;
    strength: string;
  };
};

async function loadReorderContext(db: {
  stockBatch: { findMany: (args: unknown) => Promise<StockRow[]> };
  saleLine: { findMany: (args: unknown) => Promise<Array<{ medicineId: string; quantity: number }>> };
  medicineReorderPolicy: { findMany: (args: unknown) => Promise<Array<{
    medicineId: string;
    reorderPoint: number | null;
    targetLevel: number | null;
    leadTimeDays: number;
    safetyStockDays: number;
  }>> };
}) {
  const today = startOfToday();
  const salesFrom = daysAgo(SALES_LOOKBACK_DAYS);
  const sales90From = daysAgo(90);

  const [batches, sales30, sales90, policies] = await Promise.all([
    db.stockBatch.findMany({
      where: {
        quantityOnHand: { gt: 0 },
        expiryDate: { gte: today },
      },
      include: {
        medicine: {
          select: { genericName: true, dosageForm: true, strength: true },
        },
      },
    }),
    db.saleLine.findMany({
      where: { status: "ACTIVE", createdAt: { gte: salesFrom } },
      select: { medicineId: true, quantity: true },
    }),
    db.saleLine.findMany({
      where: { status: "ACTIVE", createdAt: { gte: sales90From } },
      select: { medicineId: true, quantity: true },
    }),
    db.medicineReorderPolicy.findMany({}),
  ]);

  const stockByMedicine = new Map<
    string,
    {
      qty: number;
      stockUnit: StockUnitCode;
      unitsPerPack: number | null;
      largestBatchQty: number;
    }
  >();
  for (const batch of batches) {
    const prev = stockByMedicine.get(batch.medicineId);
    const newQty = (prev?.qty ?? 0) + batch.quantityOnHand;
    const useThisUnit =
      !prev || batch.quantityOnHand >= prev.largestBatchQty;
    stockByMedicine.set(batch.medicineId, {
      qty: newQty,
      stockUnit: useThisUnit ? batch.stockUnit : prev!.stockUnit,
      unitsPerPack: useThisUnit ? batch.unitsPerPack : prev!.unitsPerPack,
      largestBatchQty: Math.max(
        prev?.largestBatchQty ?? 0,
        batch.quantityOnHand,
      ),
    });
  }

  const sold30 = new Map<string, number>();
  for (const line of sales30) {
    sold30.set(line.medicineId, (sold30.get(line.medicineId) ?? 0) + line.quantity);
  }

  const sold90 = new Map<string, number>();
  for (const line of sales90) {
    sold90.set(line.medicineId, (sold90.get(line.medicineId) ?? 0) + line.quantity);
  }

  const policyByMedicine = new Map(
    policies.map((p) => [p.medicineId, p]),
  );

  const abcMap = buildAbcRankMap(
    Array.from(sold90.entries()).map(([medicineId, unitsSold]) => ({
      medicineId,
      unitsSold,
    })),
  );

  return { batches, stockByMedicine, sold30, policyByMedicine, abcMap };
}

function buildExpiryWatch(batches: StockRow[]): ProcurementExpiryWatchRow[] {
  return batches
    .filter((b) => {
      const days = daysUntilExpiry(b.expiryDate);
      return days >= 0 && days <= EXPIRY_WATCH_DAYS;
    })
    .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())
    .map((b) => ({
      batchId: b.id,
      medicineId: b.medicineId,
      genericName: b.medicine.genericName,
      dosageForm: b.medicine.dosageForm,
      strength: b.medicine.strength,
      batchNumber: b.batchNumber,
      quantityOnHand: b.quantityOnHand,
      stockUnit: b.stockUnit,
      unitsPerPack: b.unitsPerPack,
      expiryDate: b.expiryDate.toISOString().slice(0, 10),
      daysUntilExpiry: daysUntilExpiry(b.expiryDate),
    }));
}

function buildSuggestedLines(
  stockByMedicine: Map<
    string,
    { qty: number; stockUnit: StockUnitCode; unitsPerPack: number | null }
  >,
  sold30: Map<string, number>,
  policyByMedicine: Map<
    string,
    {
      medicineId: string;
      reorderPoint: number | null;
      targetLevel: number | null;
      leadTimeDays: number;
      safetyStockDays: number;
    }
  >,
  abcMap: Map<string, "A" | "B" | "C">,
): Array<{
  medicineId: string;
  suggestedQty: number;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
  sourceMeta: LineSourceMeta;
}> {
  const medicineIds = new Set([
    ...stockByMedicine.keys(),
    ...sold30.keys(),
  ]);

  const lines: Array<{
    medicineId: string;
    suggestedQty: number;
    stockUnit: StockUnitCode;
    unitsPerPack: number | null;
    sourceMeta: LineSourceMeta;
  }> = [];

  for (const medicineId of medicineIds) {
    const stock = stockByMedicine.get(medicineId);
    const currentStock = stock?.qty ?? 0;
    const unitsSold = sold30.get(medicineId) ?? 0;
    const avgDaily = computeAvgDailySales(unitsSold);

    if (currentStock <= 0 && unitsSold <= 0) continue;

    const stored = policyByMedicine.get(medicineId);
    const policy: ReorderPolicyInput = stored
      ? {
          reorderPoint: stored.reorderPoint,
          targetLevel: stored.targetLevel,
          leadTimeDays: stored.leadTimeDays,
          safetyStockDays: stored.safetyStockDays,
        }
      : defaultPolicy();

    const reorderPoint = computeReorderPoint(avgDaily, policy);
    const targetLevel = computeTargetLevel(avgDaily, reorderPoint, policy);
    const suggestedQty = computeSuggestedQty(
      currentStock,
      reorderPoint,
      targetLevel,
    );

    if (suggestedQty <= 0) continue;

    const sourceMeta: LineSourceMeta = {
      currentStock,
      reorderPoint: Math.ceil(reorderPoint),
      targetLevel: Math.ceil(targetLevel),
      avgDailySales: Math.round(avgDaily * 100) / 100,
      daysOfStockLeft: computeDaysOfStockLeft(currentStock, avgDaily),
      abcClass: abcMap.get(medicineId),
    };

    lines.push({
      medicineId,
      suggestedQty,
      stockUnit: stock?.stockUnit ?? "UNIT",
      unitsPerPack: stock?.unitsPerPack ?? null,
      sourceMeta,
    });
  }

  return lines.sort((a, b) => a.medicineId.localeCompare(b.medicineId));
}

function countNeedingReorder(
  stockByMedicine: Map<string, { qty: number }>,
  sold30: Map<string, number>,
  policyByMedicine: Map<
    string,
    {
      reorderPoint: number | null;
      targetLevel: number | null;
      leadTimeDays: number;
      safetyStockDays: number;
    }
  >,
): number {
  let count = 0;
  const medicineIds = new Set([...stockByMedicine.keys(), ...sold30.keys()]);
  for (const medicineId of medicineIds) {
    const currentStock = stockByMedicine.get(medicineId)?.qty ?? 0;
    const unitsSold = sold30.get(medicineId) ?? 0;
    const avgDaily = computeAvgDailySales(unitsSold);
    if (currentStock <= 0 && unitsSold <= 0) continue;
    const stored = policyByMedicine.get(medicineId);
    const policy: ReorderPolicyInput = stored
      ? {
          reorderPoint: stored.reorderPoint,
          targetLevel: stored.targetLevel,
          leadTimeDays: stored.leadTimeDays,
          safetyStockDays: stored.safetyStockDays,
        }
      : defaultPolicy();
    const reorderPoint = computeReorderPoint(avgDaily, policy);
    const targetLevel = computeTargetLevel(avgDaily, reorderPoint, policy);
    if (computeSuggestedQty(currentStock, reorderPoint, targetLevel) > 0) {
      count++;
    }
  }
  return count;
}

export async function getProcurementReorderCount(): Promise<
  ActionResult<ProcurementReorderCount>
> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "getProcurementReorderCount",
    async () => {
      const { db } = ctx;
      const { stockByMedicine, sold30, policyByMedicine } =
        await loadReorderContext(db);

      const [itemsNeedingReorder, draftOrders] = await Promise.all([
        Promise.resolve(
          countNeedingReorder(stockByMedicine, sold30, policyByMedicine),
        ),
        db.procurementOrder.count({ where: { status: "DRAFT" } }),
      ]);

      return { itemsNeedingReorder, draftOrders };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function listProcurementOrders(): Promise<
  ActionResult<ProcurementOrderSummary[]>
> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "listProcurementOrders",
    async () => {
      const orders = await ctx.db.procurementOrder.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { _count: { select: { lines: true } } },
      });

      return orders.map((o) => ({
        id: o.id,
        reference: o.reference,
        status: o.status,
        lineCount: o._count.lines,
        supplierName: o.supplierName,
        createdAt: o.createdAt.toISOString(),
        submittedAt: o.submittedAt?.toISOString() ?? null,
      }));
    },
    { tenantId: ctx.tenantId },
  );
}

export async function getProcurementOrder(
  orderId: string,
): Promise<ActionResult<ProcurementOrderDetail>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "getProcurementOrder",
    async () => {
      const order = await ctx.db.procurementOrder.findUnique({
        where: { id: orderId },
        include: {
          lines: {
            include: {
              medicine: {
                select: {
                  genericName: true,
                  dosageForm: true,
                  strength: true,
                },
              },
            },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
        },
      });

      if (!order) {
        throw new AppError("Procurement order not found", "NOT_FOUND");
      }

      const expiryWatch = Array.isArray(order.expiryWatch)
        ? (order.expiryWatch as ProcurementExpiryWatchRow[])
        : [];

      return {
        id: order.id,
        reference: order.reference,
        status: order.status,
        notes: order.notes,
        supplierName: order.supplierName,
        supplierId: order.supplierId,
        createdById: order.createdById,
        approvedById: order.approvedById,
        createdAt: order.createdAt.toISOString(),
        submittedAt: order.submittedAt?.toISOString() ?? null,
        facilityName: getActiveFacilityName(ctx.session) ?? FACILITY_NAME,
        lines: order.lines.map(mapLineView),
        expiryWatch,
      };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function generateReorderDraft(
  input?: { notes?: string; supplierName?: string; supplierId?: string },
): Promise<ActionResult<{ orderId: string }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "generateReorderDraft",
    async () => {
      const data = parseInput(generateReorderDraftSchema, input ?? {});
      const { db, session } = ctx;

      const { batches, stockByMedicine, sold30, policyByMedicine, abcMap } =
        await loadReorderContext(db);

      const suggestions = buildSuggestedLines(
        stockByMedicine,
        sold30,
        policyByMedicine,
        abcMap,
      );
      const expiryWatch = buildExpiryWatch(batches);
      const reference = await nextReference(db);

      const order = await db.procurementOrder.create({
        data: {
          reference,
          notes: data.notes ?? null,
          supplierName: data.supplierName ?? null,
          supplierId: data.supplierId ?? null,
          createdById: session.userId,
          expiryWatch: expiryWatch as unknown as Prisma.InputJsonValue,
          lines: {
            create: suggestions.map((s, index) => ({
              medicineId: s.medicineId,
              suggestedQty: s.suggestedQty,
              orderedQty: s.suggestedQty,
              stockUnit: s.stockUnit,
              unitsPerPack: s.unitsPerPack,
              reason: "LOW_STOCK",
              sourceMeta: s.sourceMeta as unknown as Prisma.InputJsonValue,
              sortOrder: index,
            })),
          },
        },
        select: { id: true },
      });

      return { orderId: order.id };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function createProcurementDraft(
  input?: { notes?: string; supplierName?: string; supplierId?: string },
): Promise<ActionResult<{ orderId: string }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "createProcurementDraft",
    async () => {
      const data = parseInput(createProcurementDraftSchema, input ?? {});
      const { db, session } = ctx;

      const { batches } = await loadReorderContext(db);
      const expiryWatch = buildExpiryWatch(batches);
      const reference = await nextReference(db);

      const order = await db.procurementOrder.create({
        data: {
          reference,
          notes: data.notes ?? null,
          supplierName: data.supplierName ?? null,
          supplierId: data.supplierId ?? null,
          createdById: session.userId,
          expiryWatch: expiryWatch as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      return { orderId: order.id };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function bulkImportProcurementLines(input: {
  orderId: string;
  lines: Array<{
    medicineId: string;
    orderedQty: number;
    stockUnit: StockUnitCode;
    unitsPerPack?: number | null;
    rawName?: string;
  }>;
}): Promise<ActionResult<{ added: number; skipped: number; orderId: string }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "bulkImportProcurementLines",
    async () => {
      const data = parseInput(bulkImportProcurementLinesSchema, input);
      const order = await ctx.db.procurementOrder.findUnique({
        where: { id: data.orderId },
        select: {
          status: true,
          _count: { select: { lines: true } },
        },
      });
      if (!order) {
        throw new AppError("Procurement order not found", "NOT_FOUND");
      }
      if (order.status !== "DRAFT") {
        throw new AppError("Only draft orders can be edited", "FORBIDDEN");
      }

      const medicineIds = data.lines.map((l) => l.medicineId);
      const found = await prisma.medicine.count({
        where: { id: { in: medicineIds }, isStub: false },
      });
      if (found !== new Set(medicineIds).size) {
        throw new AppError(
          "One or more medicines were not found in the catalog",
          "NOT_FOUND",
        );
      }

      const existing = await ctx.db.procurementOrderLine.findMany({
        where: { orderId: data.orderId },
        select: { medicineId: true },
      });
      const existingIds = new Set(existing.map((l) => l.medicineId));

      let sortOrder = order._count.lines;
      let added = 0;
      let skipped = 0;

      for (const line of data.lines) {
        if (existingIds.has(line.medicineId)) {
          skipped++;
          continue;
        }
        existingIds.add(line.medicineId);
        await ctx.db.procurementOrderLine.create({
          data: {
            orderId: data.orderId,
            medicineId: line.medicineId,
            suggestedQty: 0,
            orderedQty: line.orderedQty,
            stockUnit: line.stockUnit,
            unitsPerPack: line.unitsPerPack ?? null,
            reason: "MANUAL",
            notes: line.rawName ? `Imported: ${line.rawName}` : "Imported from partner list",
            sortOrder: sortOrder++,
          },
        });
        added++;
      }

      if (added === 0 && skipped > 0) {
        throw new AppError(
          "All imported medicines are already on this order",
          "VALIDATION",
        );
      }

      return { added, skipped, orderId: data.orderId };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function updateProcurementOrder(
  input: {
    orderId: string;
    notes?: string | null;
    supplierName?: string | null;
    supplierId?: string | null;
    lines?: Array<{
      lineId: string;
      orderedQty: number;
      priority?: string;
      notes?: string | null;
      stockUnit?: StockUnitCode;
      unitsPerPack?: number | null;
    }>;
  },
): Promise<ActionResult<{ ok: true }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "updateProcurementOrder",
    async () => {
      const data = parseInput(updateProcurementOrderSchema, input);
      const order = await ctx.db.procurementOrder.findUnique({
        where: { id: data.orderId },
        select: { status: true },
      });
      if (!order) {
        throw new AppError("Procurement order not found", "NOT_FOUND");
      }
      if (order.status !== "DRAFT") {
        throw new AppError("Only draft orders can be edited", "FORBIDDEN");
      }

      await ctx.db.procurementOrder.update({
        where: { id: data.orderId },
        data: {
          notes: data.notes,
          supplierName: data.supplierName,
          supplierId: data.supplierId,
        },
      });

      if (data.lines?.length) {
        for (const line of data.lines) {
          await ctx.db.procurementOrderLine.update({
            where: { id: line.lineId },
            data: {
              orderedQty: line.orderedQty,
              priority: line.priority,
              notes: line.notes,
              stockUnit: line.stockUnit,
              unitsPerPack: line.unitsPerPack,
            },
          });
        }
      }

      return { ok: true as const };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function addProcurementLine(
  input: {
    orderId: string;
    medicineId: string;
    orderedQty: number;
    stockUnit: StockUnitCode;
    unitsPerPack?: number | null;
    reason?: "MANUAL" | "NEW_ITEM";
    notes?: string;
  },
): Promise<ActionResult<{ lineId: string }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "addProcurementLine",
    async () => {
      const data = parseInput(addProcurementLineSchema, input);
      const order = await ctx.db.procurementOrder.findUnique({
        where: { id: data.orderId },
        select: { status: true, _count: { select: { lines: true } } },
      });
      if (!order) {
        throw new AppError("Procurement order not found", "NOT_FOUND");
      }
      if (order.status !== "DRAFT") {
        throw new AppError("Only draft orders can be edited", "FORBIDDEN");
      }

      const medicine = await prisma.medicine.findUnique({
        where: { id: data.medicineId },
        select: { id: true },
      });
      if (!medicine) {
        throw new AppError("Medicine not found in catalog", "NOT_FOUND");
      }

      const existing = await ctx.db.procurementOrderLine.findFirst({
        where: { orderId: data.orderId, medicineId: data.medicineId },
      });
      if (existing) {
        throw new AppError(
          "This medicine is already on the order — edit its quantity instead",
          "VALIDATION",
        );
      }

      const line = await ctx.db.procurementOrderLine.create({
        data: {
          orderId: data.orderId,
          medicineId: data.medicineId,
          suggestedQty: 0,
          orderedQty: data.orderedQty,
          stockUnit: data.stockUnit,
          unitsPerPack: data.unitsPerPack ?? null,
          reason: data.reason ?? "MANUAL",
          notes: data.notes ?? null,
          sortOrder: order._count.lines,
        },
        select: { id: true },
      });

      return { lineId: line.id };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function removeProcurementLine(
  lineId: string,
): Promise<ActionResult<{ ok: true }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "removeProcurementLine",
    async () => {
      const row = await ctx.db.procurementOrderLine.findUnique({
        where: { id: lineId },
        include: { order: { select: { status: true } } },
      });
      if (!row) {
        throw new AppError("Line not found", "NOT_FOUND");
      }
      if (row.order.status !== "DRAFT") {
        throw new AppError("Only draft orders can be edited", "FORBIDDEN");
      }
      await ctx.db.procurementOrderLine.delete({ where: { id: lineId } });
      return { ok: true as const };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function submitProcurementOrder(
  orderId: string,
): Promise<ActionResult<{ ok: true }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "submitProcurementOrder",
    async () => {
      const data = parseInput(submitProcurementOrderSchema, { orderId });
      const order = await ctx.db.procurementOrder.findUnique({
        where: { id: data.orderId },
        include: { _count: { select: { lines: true } } },
      });
      if (!order) {
        throw new AppError("Procurement order not found", "NOT_FOUND");
      }
      if (order.status !== "DRAFT") {
        throw new AppError("Order has already been submitted", "FORBIDDEN");
      }
      if (order._count.lines === 0) {
        throw new AppError("Add at least one line before submitting", "VALIDATION");
      }

      await ctx.db.procurementOrder.update({
        where: { id: data.orderId },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          approvedById: ctx.session.userId,
        },
      });

      return { ok: true as const };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function deleteProcurementOrder(
  orderId: string,
): Promise<ActionResult<{ ok: true }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "deleteProcurementOrder",
    async () => {
      const data = parseInput(submitProcurementOrderSchema, { orderId });
      const order = await ctx.db.procurementOrder.findUnique({
        where: { id: data.orderId },
        select: { status: true },
      });
      if (!order) {
        throw new AppError("Procurement order not found", "NOT_FOUND");
      }
      if (order.status !== "DRAFT") {
        throw new AppError("Only draft orders can be deleted", "FORBIDDEN");
      }
      await ctx.db.procurementOrder.delete({ where: { id: data.orderId } });
      return { ok: true as const };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function getProcurementReport(
  orderId: string,
): Promise<ActionResult<ProcurementReportData>> {
  const detail = await getProcurementOrder(orderId);
  if (!detail.success) return detail;

  const o = detail.data;
  return {
    success: true,
    data: {
      reportTitle: `Procurement requisition ${o.reference}`,
      reference: o.reference,
      status: o.status,
      facilityName: o.facilityName,
      generatedAt: new Date().toISOString(),
      supplierName: o.supplierName,
      notes: o.notes,
      lineCount: o.lines.length,
      lines: o.lines,
      expiryWatch: o.expiryWatch,
    },
  };
}

export async function listOpenProcurementOrders(): Promise<
  ActionResult<Array<{ id: string; reference: string; status: string }>>
> {
  const ctx = await requireTenantContext("receive.stock");
  return runAction(
    "listOpenProcurementOrders",
    async () => {
      const orders = await ctx.db.procurementOrder.findMany({
        where: { status: { in: ["SUBMITTED", "PARTIALLY_RECEIVED"] } },
        orderBy: { submittedAt: "desc" },
        select: { id: true, reference: true, status: true },
      });
      return orders;
    },
    { tenantId: ctx.tenantId },
  );
}

export async function recordProcurementReceipt(
  db: {
    procurementOrderLine: {
      findUnique: (args: unknown) => Promise<{
        id: string;
        orderId: string;
        receivedQty: number;
        orderedQty: number;
      } | null>;
      update: (args: unknown) => Promise<unknown>;
    };
    procurementOrder: {
      findUnique: (args: unknown) => Promise<{
        id: string;
        lines: Array<{ orderedQty: number; receivedQty: number }>;
      } | null>;
      update: (args: unknown) => Promise<unknown>;
    };
  },
  procurementLineId: string,
  quantityReceived: number,
): Promise<void> {
  const line = await db.procurementOrderLine.findUnique({
    where: { id: procurementLineId },
    select: {
      id: true,
      orderId: true,
      receivedQty: true,
      orderedQty: true,
    },
  });
  if (!line) return;

  await db.procurementOrderLine.update({
    where: { id: line.id },
    data: { receivedQty: line.receivedQty + quantityReceived },
  });

  const order = await db.procurementOrder.findUnique({
    where: { id: line.orderId },
    select: {
      status: true,
      lines: { select: { orderedQty: true, receivedQty: true } },
    },
  });
  if (!order) return;

  const allReceived = order.lines.every((l) => l.receivedQty >= l.orderedQty);
  const anyReceived = order.lines.some((l) => l.receivedQty > 0);
  const nextStatus = allReceived
    ? "CLOSED"
    : anyReceived
      ? "PARTIALLY_RECEIVED"
      : order.status;

  if (nextStatus !== order.status) {
    await db.procurementOrder.update({
      where: { id: line.orderId },
      data: { status: nextStatus },
    });
  }
}

export async function getProcurementVarianceReport(): Promise<
  ActionResult<import("@/lib/types").ProcurementVarianceReport>
> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "getProcurementVarianceReport",
    async () => {
      const orders = await ctx.db.procurementOrder.findMany({
        where: {
          status: { in: ["SUBMITTED", "PARTIALLY_RECEIVED", "CLOSED"] },
        },
        orderBy: { submittedAt: "desc" },
        take: 20,
        include: {
          lines: {
            include: {
              medicine: {
                select: {
                  genericName: true,
                  dosageForm: true,
                  strength: true,
                },
              },
            },
          },
        },
      });

      const rows = orders.flatMap((order) =>
        order.lines.map((line) => ({
          reference: order.reference,
          orderId: order.id,
          status: order.status,
          genericName: line.medicine.genericName,
          dosageForm: line.medicine.dosageForm,
          strength: line.medicine.strength,
          orderedQty: line.orderedQty,
          receivedQty: line.receivedQty,
          variance: line.receivedQty - line.orderedQty,
          stockUnit: line.stockUnit,
          submittedAt: order.submittedAt?.toISOString() ?? null,
        })),
      );

      return {
        facilityName: getActiveFacilityName(ctx.session) ?? FACILITY_NAME,
        generatedAt: new Date().toISOString(),
        rows,
      };
    },
    { tenantId: ctx.tenantId },
  );
}
