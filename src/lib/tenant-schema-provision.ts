/**
 * Create and register per-tenant PostgreSQL schemas (Neon-safe, idempotent).
 */

import { prisma } from "@/lib/prisma";
import { tenantSchemaName } from "@/lib/tenant-schema";
import {
  TENANT_SCHEMA_REGISTRY_DDL,
  tenantDataMigrationSql,
  tenantSchemaDdl,
} from "@/lib/tenant-schema-ddl";

export async function ensureTenantSchemaRegistry(): Promise<void> {
  await prisma.$executeRawUnsafe(TENANT_SCHEMA_REGISTRY_DDL);
}

export async function isTenantSchemaProvisioned(
  tenantId: string,
): Promise<boolean> {
  await ensureTenantSchemaRegistry();
  const rows = await prisma.$queryRaw<Array<{ tenant_id: string }>>`
    SELECT tenant_id FROM tenant_schema_registry WHERE tenant_id = ${tenantId}
  `;
  return rows.length > 0;
}

/**
 * CREATE SCHEMA + operational tables for one facility.
 * Safe to call multiple times (IF NOT EXISTS throughout).
 */
export async function provisionTenantSchema(tenantId: string): Promise<string> {
  const schema = tenantSchemaName(tenantId);
  await ensureTenantSchemaRegistry();

  for (const stmt of tenantSchemaDdl(tenantId)) {
    await prisma.$executeRawUnsafe(stmt);
  }

  await prisma.$executeRaw`
    INSERT INTO tenant_schema_registry (tenant_id, schema_name)
    VALUES (${tenantId}, ${schema})
    ON CONFLICT (tenant_id) DO NOTHING
  `;

  return schema;
}

/**
 * Copy legacy public-schema rows (WHERE tenantId = ?) into the tenant schema.
 * Run once during brownfield migration.
 */
export async function migratePublicDataToTenantSchema(
  tenantId: string,
): Promise<void> {
  await provisionTenantSchema(tenantId);
  for (const stmt of tenantDataMigrationSql(tenantId)) {
    await prisma.$executeRawUnsafe(stmt);
  }
}

/** Cross-tenant admin stats — query one tenant schema directly. */
export async function countTenantTable(
  tenantId: string,
  table: "stock_batches" | "sales",
): Promise<number> {
  const schema = tenantSchemaName(tenantId);
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "${schema.replace(/"/g, '""')}"."${table}"`,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function sumActiveSaleLinesSince(
  tenantId: string,
  since: Date,
): Promise<{ units: number; revenue: number }> {
  const schema = tenantSchemaName(tenantId);
  const safeSchema = schema.replace(/"/g, '""');
  const rows = await prisma.$queryRawUnsafe<
    Array<{ units: bigint | null; revenue: string | null }>
  >(
    `SELECT COALESCE(SUM(quantity), 0)::bigint AS units,
            COALESCE(SUM("lineTotal"), 0)::text AS revenue
     FROM "${safeSchema}".sale_lines
     WHERE status = 'ACTIVE' AND "createdAt" >= $1`,
    since,
  );
  const row = rows[0];
  return {
    units: Number(row?.units ?? 0),
    revenue: Number.parseFloat(row?.revenue ?? "0"),
  };
}
