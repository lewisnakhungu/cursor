/**
 * Pure tenant-scoping helpers for the Prisma extension.
 * Kept free of Prisma imports so they unit-test without a database.
 */

/** Ops whose `where` is a plain filter — safe to wrap in AND. */
export const scopedWhereOps = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Ops whose `where` is a WhereUniqueInput. Prisma requires a top-level
 * unique field there, so AND-wrapping breaks; instead we spread tenantId
 * alongside the caller's where (extended where-unique). Spreading LAST
 * forces our tenantId even if the caller passed one.
 */
export const scopedUniqueWhereOps = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
]);

export const scopedCreateOps = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
]);

export function mergeTenantWhere(
  where: Record<string, unknown> | undefined,
  tenantId: string,
): Record<string, unknown> {
  if (!where) {
    return { tenantId };
  }
  return { AND: [where, { tenantId }] };
}

export function mergeTenantUniqueWhere(
  where: Record<string, unknown> | undefined,
  tenantId: string,
): Record<string, unknown> {
  return { ...(where ?? {}), tenantId };
}

export function injectTenantIntoData(
  data: Record<string, unknown> | Record<string, unknown>[],
  tenantId: string,
): Record<string, unknown> | Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...row, tenantId }));
  }
  return { ...data, tenantId };
}

export function scopeQueryArgs(
  params: { operation: string; args: Record<string, unknown> },
  tenantId: string,
): Record<string, unknown> {
  const { operation } = params;
  const nextArgs = { ...params.args };

  if (scopedWhereOps.has(operation)) {
    nextArgs.where = mergeTenantWhere(
      nextArgs.where as Record<string, unknown> | undefined,
      tenantId,
    );
  }

  if (scopedUniqueWhereOps.has(operation)) {
    nextArgs.where = mergeTenantUniqueWhere(
      nextArgs.where as Record<string, unknown> | undefined,
      tenantId,
    );
  }

  if (scopedCreateOps.has(operation) && nextArgs.data !== undefined) {
    nextArgs.data = injectTenantIntoData(
      nextArgs.data as Record<string, unknown> | Record<string, unknown>[],
      tenantId,
    );
  }

  if (operation === "upsert") {
    nextArgs.where = mergeTenantUniqueWhere(
      nextArgs.where as Record<string, unknown> | undefined,
      tenantId,
    );
    if (nextArgs.create !== undefined) {
      nextArgs.create = injectTenantIntoData(
        nextArgs.create as Record<string, unknown>,
        tenantId,
      );
    }
    if (nextArgs.update !== undefined) {
      nextArgs.update = {
        ...(nextArgs.update as Record<string, unknown>),
        tenantId,
      };
    }
  }

  return nextArgs;
}

/**
 * FEFO allocation (pure): given batches sorted nearest-expiry-first,
 * decide how much to take from each to satisfy `requested`.
 * Mirrors the dispense transaction's allocation loop.
 */
export function allocateFefo(
  batches: Array<{ id: string; quantityOnHand: number }>,
  requested: number,
): { allocations: Array<{ batchId: string; take: number }>; shortfall: number } {
  const allocations: Array<{ batchId: string; take: number }> = [];
  let remaining = requested;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantityOnHand, remaining);
    if (take <= 0) continue;
    allocations.push({ batchId: batch.id, take });
    remaining -= take;
  }

  return { allocations, shortfall: Math.max(0, remaining) };
}
