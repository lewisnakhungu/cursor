import { getTenantPrisma, type TenantPrismaClient } from "@/lib/prisma-tenant";
import { getActiveTenantId } from "@/lib/tenant-context";

export type TenantDb = {
  tenantId: string;
  db: TenantPrismaClient;
};

export async function resolveTenantDb(): Promise<TenantDb> {
  const tenantId = await getActiveTenantId();
  return { tenantId, db: getTenantPrisma(tenantId) };
}
