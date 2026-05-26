import { prisma } from "@/lib/prisma";

function mergeTenantWhere(
  where: Record<string, unknown> | undefined,
  tenantId: string,
): Record<string, unknown> {
  if (!where) {
    return { tenantId };
  }
  return { AND: [where, { tenantId }] };
}

function injectTenantIntoData(
  data: Record<string, unknown> | Record<string, unknown>[],
  tenantId: string,
): Record<string, unknown> | Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...row, tenantId }));
  }
  return { ...data, tenantId };
}

const scopedWhereOps = new Set([
  "findMany",
  "findFirst",
  "findUnique",
  "findFirstOrThrow",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

const scopedCreateOps = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
]);

type ScopedQueryArgs = {
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
};

function scopeQueryArgs(args: ScopedQueryArgs, tenantId: string): Record<string, unknown> {
  const { operation } = args;
  const nextArgs = { ...args.args };

  if (scopedWhereOps.has(operation)) {
    nextArgs.where = mergeTenantWhere(
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
    nextArgs.where = mergeTenantWhere(
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

function tenantModelExtension(tenantId: string) {
  return {
    async $allOperations({
      operation,
      args,
      query,
    }: ScopedQueryArgs) {
      return query(scopeQueryArgs({ operation, args, query }, tenantId));
    },
  };
}

function createTenantClient(tenantId: string) {
  return prisma.$extends({
    name: "tenantIsolation",
    query: {
      stockBatch: tenantModelExtension(tenantId),
      sale: tenantModelExtension(tenantId),
      saleLine: tenantModelExtension(tenantId),
    },
  });
}

const tenantClientCache = new Map<string, ReturnType<typeof createTenantClient>>();

export type TenantPrismaClient = ReturnType<typeof createTenantClient>;

/**
 * Returns a Prisma client that automatically scopes stockBatch, sale, and saleLine
 * queries to the given tenant. Medicine / MedicineAlias remain global (use base prisma).
 */
export function getTenantPrisma(tenantId: string): TenantPrismaClient {
  let client = tenantClientCache.get(tenantId);
  if (!client) {
    client = createTenantClient(tenantId);
    tenantClientCache.set(tenantId, client);
  }
  return client;
}
