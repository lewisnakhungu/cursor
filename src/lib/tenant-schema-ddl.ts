/**
 * DDL for per-tenant PostgreSQL schemas.
 * Tables mirror public schema (Prisma db push) but live in tenant_<id> schemas.
 * Shared catalog (medicines) and identity (tenants, users) stay in public.
 */

import { tenantSchemaName } from "@/lib/tenant-schema";

function q(schema: string, ident: string): string {
  return `${quoteSchema(schema)}.${quoteIdent(ident)}`;
}

function quoteSchema(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** CREATE SCHEMA + operational tables for one facility. Idempotent. */
export function tenantSchemaDdl(tenantId: string): string[] {
  const schema = tenantSchemaName(tenantId);
  const s = quoteSchema(schema);

  return [
    `CREATE SCHEMA IF NOT EXISTS ${s}`,

    `CREATE TABLE IF NOT EXISTS ${q(schema, "suppliers")} (
      id TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      name TEXT NOT NULL,
      contact TEXT,
      notes TEXT,
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT suppliers_pkey PRIMARY KEY (id),
      CONSTRAINT suppliers_tenantId_fkey FOREIGN KEY ("tenantId")
        REFERENCES public.tenants(id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS suppliers_tenantId_name_key
      ON ${q(schema, "suppliers")} ("tenantId", name)`,
    `CREATE INDEX IF NOT EXISTS suppliers_tenantId_idx
      ON ${q(schema, "suppliers")} ("tenantId")`,

    `CREATE TABLE IF NOT EXISTS ${q(schema, "medicine_reorder_policies")} (
      id TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "medicineId" TEXT NOT NULL,
      "reorderPoint" INTEGER,
      "targetLevel" INTEGER,
      "leadTimeDays" INTEGER NOT NULL DEFAULT 14,
      "safetyStockDays" INTEGER NOT NULL DEFAULT 3,
      CONSTRAINT medicine_reorder_policies_pkey PRIMARY KEY (id),
      CONSTRAINT medicine_reorder_policies_tenantId_fkey FOREIGN KEY ("tenantId")
        REFERENCES public.tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT medicine_reorder_policies_medicineId_fkey FOREIGN KEY ("medicineId")
        REFERENCES public.medicines(id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS medicine_reorder_policies_tenantId_medicineId_key
      ON ${q(schema, "medicine_reorder_policies")} ("tenantId", "medicineId")`,
    `CREATE INDEX IF NOT EXISTS medicine_reorder_policies_tenantId_idx
      ON ${q(schema, "medicine_reorder_policies")} ("tenantId")`,

    `CREATE TABLE IF NOT EXISTS ${q(schema, "procurement_orders")} (
      id TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      reference TEXT NOT NULL,
      status public."ProcurementOrderStatus" NOT NULL DEFAULT 'DRAFT',
      notes TEXT,
      "supplierName" TEXT,
      "supplierId" TEXT,
      "createdById" TEXT NOT NULL,
      "approvedById" TEXT,
      "expiryWatch" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "submittedAt" TIMESTAMP(3),
      CONSTRAINT procurement_orders_pkey PRIMARY KEY (id),
      CONSTRAINT procurement_orders_tenantId_fkey FOREIGN KEY ("tenantId")
        REFERENCES public.tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT procurement_orders_supplierId_fkey FOREIGN KEY ("supplierId")
        REFERENCES ${q(schema, "suppliers")}(id) ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS procurement_orders_tenantId_reference_key
      ON ${q(schema, "procurement_orders")} ("tenantId", reference)`,
    `CREATE INDEX IF NOT EXISTS procurement_orders_tenantId_status_createdAt_idx
      ON ${q(schema, "procurement_orders")} ("tenantId", status, "createdAt")`,

    `CREATE TABLE IF NOT EXISTS ${q(schema, "procurement_order_lines")} (
      id TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "orderId" TEXT NOT NULL,
      "medicineId" TEXT NOT NULL,
      "suggestedQty" INTEGER NOT NULL,
      "orderedQty" INTEGER NOT NULL,
      "receivedQty" INTEGER NOT NULL DEFAULT 0,
      "stockUnit" public."StockUnit" NOT NULL,
      "unitsPerPack" INTEGER,
      reason public."ProcurementLineReason" NOT NULL,
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      notes TEXT,
      "sourceMeta" JSONB,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT procurement_order_lines_pkey PRIMARY KEY (id),
      CONSTRAINT procurement_order_lines_orderId_fkey FOREIGN KEY ("orderId")
        REFERENCES ${q(schema, "procurement_orders")}(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT procurement_order_lines_medicineId_fkey FOREIGN KEY ("medicineId")
        REFERENCES public.medicines(id) ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS procurement_order_lines_orderId_idx
      ON ${q(schema, "procurement_order_lines")} ("orderId")`,
    `CREATE INDEX IF NOT EXISTS procurement_order_lines_tenantId_medicineId_idx
      ON ${q(schema, "procurement_order_lines")} ("tenantId", "medicineId")`,

    `CREATE TABLE IF NOT EXISTS ${q(schema, "stock_batches")} (
      id TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "medicineId" TEXT NOT NULL,
      "batchNumber" TEXT,
      "supplierName" TEXT,
      "quantityOnHand" INTEGER NOT NULL,
      "quantityReceived" INTEGER NOT NULL DEFAULT 0,
      "expiryDate" DATE NOT NULL,
      "supplierCost" DECIMAL(12,2),
      "retailSalePrice" DECIMAL(12,2),
      "stockUnit" public."StockUnit" NOT NULL DEFAULT 'UNIT',
      "unitsPerPack" INTEGER,
      "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "procurementOrderId" TEXT,
      "procurementLineId" TEXT,
      "receivedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT stock_batches_pkey PRIMARY KEY (id),
      CONSTRAINT stock_batches_tenantId_fkey FOREIGN KEY ("tenantId")
        REFERENCES public.tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT stock_batches_medicineId_fkey FOREIGN KEY ("medicineId")
        REFERENCES public.medicines(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT procurement_orders_stock_batches_fkey FOREIGN KEY ("procurementOrderId")
        REFERENCES ${q(schema, "procurement_orders")}(id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT procurement_order_lines_stock_batches_fkey FOREIGN KEY ("procurementLineId")
        REFERENCES ${q(schema, "procurement_order_lines")}(id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT stock_batches_quantity_nonnegative CHECK ("quantityOnHand" >= 0)
    )`,
    `CREATE INDEX IF NOT EXISTS stock_batches_tenantId_medicineId_expiryDate_idx
      ON ${q(schema, "stock_batches")} ("tenantId", "medicineId", "expiryDate")`,
    `CREATE INDEX IF NOT EXISTS stock_batches_procurementOrderId_idx
      ON ${q(schema, "stock_batches")} ("procurementOrderId")`,
    `CREATE INDEX IF NOT EXISTS stock_batches_medicineId_expiryDate_idx
      ON ${q(schema, "stock_batches")} ("medicineId", "expiryDate")`,
    `CREATE INDEX IF NOT EXISTS stock_batches_expiryDate_idx
      ON ${q(schema, "stock_batches")} ("expiryDate")`,
    `CREATE INDEX IF NOT EXISTS stock_batches_receivedAt_idx
      ON ${q(schema, "stock_batches")} ("receivedAt")`,

    `CREATE TABLE IF NOT EXISTS ${q(schema, "sales")} (
      id TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
      "dispensedById" TEXT,
      CONSTRAINT sales_pkey PRIMARY KEY (id),
      CONSTRAINT sales_tenantId_fkey FOREIGN KEY ("tenantId")
        REFERENCES public.tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS sales_tenantId_createdAt_idx
      ON ${q(schema, "sales")} ("tenantId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS sales_createdAt_idx
      ON ${q(schema, "sales")} ("createdAt")`,

    `CREATE TABLE IF NOT EXISTS ${q(schema, "sale_lines")} (
      id TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "saleId" TEXT NOT NULL,
      "medicineId" TEXT NOT NULL,
      "stockBatchId" TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
      "lineTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
      status public."SaleLineStatus" NOT NULL DEFAULT 'ACTIVE',
      "correctionNote" TEXT,
      "correctedById" TEXT,
      "genericName" TEXT NOT NULL,
      "dosageForm" TEXT NOT NULL,
      strength TEXT NOT NULL,
      "itemType" public."CatalogItemType" NOT NULL DEFAULT 'MEDICINE',
      "stockUnit" public."StockUnit" NOT NULL DEFAULT 'UNIT',
      "unitsPerPack" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT sale_lines_pkey PRIMARY KEY (id),
      CONSTRAINT sale_lines_tenantId_fkey FOREIGN KEY ("tenantId")
        REFERENCES public.tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT sale_lines_saleId_fkey FOREIGN KEY ("saleId")
        REFERENCES ${q(schema, "sales")}(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT sale_lines_medicineId_fkey FOREIGN KEY ("medicineId")
        REFERENCES public.medicines(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT sale_lines_stockBatchId_fkey FOREIGN KEY ("stockBatchId")
        REFERENCES ${q(schema, "stock_batches")}(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT sale_lines_quantity_nonnegative CHECK (quantity >= 0)
    )`,
    `CREATE INDEX IF NOT EXISTS sale_lines_tenantId_createdAt_idx
      ON ${q(schema, "sale_lines")} ("tenantId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS sale_lines_saleId_idx
      ON ${q(schema, "sale_lines")} ("saleId")`,
    `CREATE INDEX IF NOT EXISTS sale_lines_medicineId_idx
      ON ${q(schema, "sale_lines")} ("medicineId")`,
    `CREATE INDEX IF NOT EXISTS sale_lines_status_idx
      ON ${q(schema, "sale_lines")} (status)`,
    `CREATE INDEX IF NOT EXISTS sale_lines_itemType_idx
      ON ${q(schema, "sale_lines")} ("itemType")`,

    // --- StockMovement (append-only audit ledger) ---
    `CREATE TABLE IF NOT EXISTS ${q(schema, "stock_movements")} (
      id TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "stockBatchId" TEXT NOT NULL,
      type public."StockMovementType" NOT NULL,
      "quantityDelta" INTEGER NOT NULL,
      "balanceAfter" INTEGER NOT NULL,
      "referenceType" TEXT NOT NULL,
      "referenceId" TEXT,
      reason TEXT,
      "performedById" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT stock_movements_pkey PRIMARY KEY (id),
      CONSTRAINT stock_movements_tenantId_fkey FOREIGN KEY ("tenantId")
        REFERENCES public.tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT stock_movements_stockBatchId_fkey FOREIGN KEY ("stockBatchId")
        REFERENCES ${q(schema, "stock_batches")}(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT stock_movements_performedById_fkey FOREIGN KEY ("performedById")
        REFERENCES public.users(id) ON UPDATE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS stock_movements_tenantId_stockBatchId_createdAt_idx
      ON ${q(schema, "stock_movements")} ("tenantId", "stockBatchId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS stock_movements_performedById_createdAt_idx
      ON ${q(schema, "stock_movements")} ("performedById", "createdAt")`,

    // Immutability trigger: prevent UPDATE/DELETE on audit ledger
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'block_ledger_mutation') THEN
        CREATE FUNCTION block_ledger_mutation() RETURNS TRIGGER AS $fn$
        BEGIN
          RAISE EXCEPTION 'Audit trail records cannot be modified or deleted';
        END;
        $fn$ LANGUAGE plpgsql;
      END IF;
    END $$`,
    `DROP TRIGGER IF EXISTS trg_stock_movements_immutable ON ${q(schema, "stock_movements")}`,
    `CREATE TRIGGER trg_stock_movements_immutable
      BEFORE UPDATE OR DELETE ON ${q(schema, "stock_movements")}
      FOR EACH ROW EXECUTE FUNCTION block_ledger_mutation()`,
  ];
}

/** Registry table in public — tracks provisioned tenant schemas. */
export const TENANT_SCHEMA_REGISTRY_DDL = `
  CREATE TABLE IF NOT EXISTS public.tenant_schema_registry (
    tenant_id TEXT PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    schema_name TEXT NOT NULL UNIQUE,
    provisioned_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

/** Copy rows from public (legacy shared-schema) into a tenant schema. Idempotent. */
export function tenantDataMigrationSql(tenantId: string): string[] {
  const schema = tenantSchemaName(tenantId);
  const s = quoteSchema(schema);
  const tables = [
    "suppliers",
    "medicine_reorder_policies",
    "procurement_orders",
    "procurement_order_lines",
    "stock_batches",
    "sales",
    "sale_lines",
    "stock_movements",
  ] as const;

  return tables.map(
    (table) => `
      INSERT INTO ${s}.${quoteIdent(table)}
      SELECT * FROM public.${quoteIdent(table)}
      WHERE "tenantId" = '${tenantId.replace(/'/g, "''")}'
      ON CONFLICT (id) DO NOTHING
    `,
  );
}
