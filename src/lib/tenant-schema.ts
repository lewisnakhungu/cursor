/**
 * PostgreSQL schema-per-tenant isolation for Neon + Vercel serverless.
 *
 * Each facility gets schema tenant_<id> with operational tables.
 * Every request sets SET LOCAL search_path inside a transaction so pooled
 * connections cannot leak tenant context.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** Active interactive transaction with search_path already set. */
export type TenantTxClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

const tenantTxStorage = new AsyncLocalStorage<TenantTxClient>();

export function getActiveTenantTx(): TenantTxClient | undefined {
  return tenantTxStorage.getStore();
}

/** Safe PostgreSQL schema name derived from tenant id (cuid or demo slug). */
export function tenantSchemaName(tenantId: string): string {
  const safe = tenantId.replace(/[^a-zA-Z0-9_]/g, "_");
  if (!safe || safe.length > 48) {
    throw new Error(`Invalid tenant id for schema: ${tenantId}`);
  }
  return `tenant_${safe}`;
}

function quoteSchema(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function setLocalSearchPath(
  tx: Pick<TenantTxClient, "$executeRawUnsafe">,
  tenantId: string,
): Promise<void> {
  const schema = tenantSchemaName(tenantId);
  await tx.$executeRawUnsafe(
    `SET LOCAL search_path TO ${quoteSchema(schema)}, public`,
  );
}

export type TenantTransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
};

/**
 * Run fn inside a transaction scoped to the tenant's PostgreSQL schema.
 * Re-entrant: nested calls reuse the outer transaction via AsyncLocalStorage.
 */
export async function withTenantSchema<T>(
  tenantId: string,
  fn: (tx: TenantTxClient) => Promise<T>,
  options?: TenantTransactionOptions,
): Promise<T> {
  const activeTx = tenantTxStorage.getStore();
  if (activeTx) {
    return fn(activeTx);
  }

  return prisma.$transaction(
    async (tx) => {
      await setLocalSearchPath(tx, tenantId);
      return tenantTxStorage.run(tx, () => fn(tx));
    },
    {
      isolationLevel:
        options?.isolationLevel ??
        Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: options?.maxWait ?? 10_000,
      timeout: options?.timeout ?? 30_000,
    },
  );
}

/** Default options for dispense / stock mutations (matches prior dispense.ts). */
export const TENANT_STOCK_TX_OPTIONS: TenantTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 30_000,
};
