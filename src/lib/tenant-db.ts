import type { SessionPayload } from "@/lib/auth/session-types";
import { getTenantPrisma, type TenantPrismaClient } from "@/lib/prisma-tenant";
import { getActiveTenantId } from "@/lib/tenant-context";

export type TenantDb = {
  tenantId: string;
  db: TenantPrismaClient;
};

export async function resolveTenantDb(
  session?: SessionPayload,
): Promise<TenantDb> {
  const tenantId = session?.activeFacilityId ?? (await getActiveTenantId());
  return { tenantId, db: getTenantPrisma(tenantId) };
}
