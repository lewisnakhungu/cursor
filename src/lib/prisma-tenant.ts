import { prisma } from "@/lib/prisma";
import { scopeQueryArgs } from "@/lib/tenant-scope";

type ScopedQueryArgs = {
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
};

function tenantModelExtension(tenantId: string) {
  return {
    async $allOperations({
      operation,
      args,
      query,
    }: ScopedQueryArgs) {
      return query(scopeQueryArgs({ operation, args }, tenantId));
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
      procurementOrder: tenantModelExtension(tenantId),
      procurementOrderLine: tenantModelExtension(tenantId),
      medicineReorderPolicy: tenantModelExtension(tenantId),
      supplier: tenantModelExtension(tenantId),
    },
  });
}

/**
 * Bounded cache: FIFO eviction keeps memory flat with many tenants.
 * Recreating a client is cheap (extension over the singleton base client).
 */
const MAX_CACHED_TENANT_CLIENTS = 100;
const tenantClientCache = new Map<string, ReturnType<typeof createTenantClient>>();

export type TenantPrismaClient = ReturnType<typeof createTenantClient>;

/**
 * Prisma client that scopes stockBatch, sale, and saleLine to one tenant.
 * Medicine / MedicineAlias stay on the base `prisma` client (shared KEML catalog).
 */
export function getTenantPrisma(tenantId: string): TenantPrismaClient {
  let client = tenantClientCache.get(tenantId);
  if (!client) {
    if (tenantClientCache.size >= MAX_CACHED_TENANT_CLIENTS) {
      const oldest = tenantClientCache.keys().next().value;
      if (oldest !== undefined) tenantClientCache.delete(oldest);
    }
    client = createTenantClient(tenantId);
    tenantClientCache.set(tenantId, client);
  }
  return client;
}
