import { prisma } from "@/lib/prisma";
import { scopeQueryArgs } from "@/lib/tenant-scope";
import {
  getActiveTenantTx,
  withTenantSchema,
} from "@/lib/tenant-schema";

type ScopedQueryArgs = {
  operation: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
};

const TENANT_MODELS = [
  "stockBatch",
  "sale",
  "saleLine",
  "procurementOrder",
  "procurementOrderLine",
  "medicineReorderPolicy",
  "supplier",
  "stockMovement",
] as const;

type TenantModel = (typeof TENANT_MODELS)[number];

type ModelDelegate = Record<string, (args: unknown) => Promise<unknown>>;

function runOnTenantTx(
  tx: NonNullable<ReturnType<typeof getActiveTenantTx>>,
  model: TenantModel,
  operation: string,
  scopedArgs: Record<string, unknown>,
): Promise<unknown> {
  const delegate = tx[model] as unknown as ModelDelegate;
  const fn = delegate[operation];
  if (typeof fn !== "function") {
    throw new Error(`Unsupported tenant operation: ${model}.${operation}`);
  }
  return fn(scopedArgs);
}

function tenantModelExtension(tenantId: string, model: TenantModel) {
  return {
    async $allOperations({ operation, args }: ScopedQueryArgs) {
      const scopedArgs = scopeQueryArgs({ operation, args }, tenantId);
      const activeTx = getActiveTenantTx();
      if (activeTx) {
        return runOnTenantTx(activeTx, model, operation, scopedArgs);
      }
      return withTenantSchema(tenantId, (tx) =>
        runOnTenantTx(tx, model, operation, scopedArgs),
      );
    },
  };
}

function createTenantClient(tenantId: string) {
  return prisma.$extends({
    name: "tenantSchemaIsolation",
    query: {
      stockBatch: tenantModelExtension(tenantId, "stockBatch"),
      sale: tenantModelExtension(tenantId, "sale"),
      saleLine: tenantModelExtension(tenantId, "saleLine"),
      procurementOrder: tenantModelExtension(tenantId, "procurementOrder"),
      procurementOrderLine: tenantModelExtension(
        tenantId,
        "procurementOrderLine",
      ),
      medicineReorderPolicy: tenantModelExtension(
        tenantId,
        "medicineReorderPolicy",
      ),
      supplier: tenantModelExtension(tenantId, "supplier"),
      stockMovement: tenantModelExtension(tenantId, "stockMovement"),
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
 * Prisma client scoped to one tenant PostgreSQL schema (search_path) plus
 * tenantId filters. Medicine / MedicineAlias use the base `prisma` client.
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
