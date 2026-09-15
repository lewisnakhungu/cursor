import type { SessionPayload } from "@/lib/auth/session-types";
import { getTenantPrisma, type TenantPrismaClient } from "@/lib/prisma-tenant";
import { getActiveTenantId } from "@/lib/tenant-context";
import {
  withTenantSchema,
  type TenantTxClient,
  type TenantTransactionOptions,
} from "@/lib/tenant-schema";

export type TenantDb = {
  tenantId: string;
  db: TenantPrismaClient;
  /** Interactive transaction with SET LOCAL search_path (for multi-step writes). */
  transaction: <T>(
    fn: (tx: TenantTxClient) => Promise<T>,
    options?: TenantTransactionOptions,
  ) => Promise<T>;
};

export async function resolveTenantDb(
  session?: SessionPayload,
): Promise<TenantDb> {
  const tenantId = session?.activeFacilityId ?? (await getActiveTenantId());
  return {
    tenantId,
    db: getTenantPrisma(tenantId),
    transaction: (fn, options) => withTenantSchema(tenantId, fn, options),
  };
}

export {
  withTenantSchema,
  type TenantTxClient,
  type TenantTransactionOptions,
} from "@/lib/tenant-schema";
