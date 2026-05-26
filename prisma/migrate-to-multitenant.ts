/**
 * Idempotent brownfield migration: ensures default tenant and assigns tenantId
 * on all operational rows. Safe to re-run.
 *
 * Usage: npx tsx prisma/migrate-to-multitenant.ts
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Pool } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const DEFAULT_TENANT_ID = "default";

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.tenant.upsert({
        where: { id: DEFAULT_TENANT_ID },
        create: {
          id: DEFAULT_TENANT_ID,
          name: "Default Facility",
          slug: "default",
        },
        update: {},
      });

      const [batches, sales, lines] = await Promise.all([
        tx.stockBatch.updateMany({
          where: { tenantId: { not: DEFAULT_TENANT_ID } },
          data: { tenantId: DEFAULT_TENANT_ID },
        }),
        tx.sale.updateMany({
          where: { tenantId: { not: DEFAULT_TENANT_ID } },
          data: { tenantId: DEFAULT_TENANT_ID },
        }),
        tx.saleLine.updateMany({
          where: { tenantId: { not: DEFAULT_TENANT_ID } },
          data: { tenantId: DEFAULT_TENANT_ID },
        }),
      ]);

      const orphanBatches = await tx.$executeRaw`
        UPDATE stock_batches SET "tenantId" = ${DEFAULT_TENANT_ID}
        WHERE "tenantId" IS NULL OR "tenantId" = ''
      `;
      const orphanSales = await tx.$executeRaw`
        UPDATE sales SET "tenantId" = ${DEFAULT_TENANT_ID}
        WHERE "tenantId" IS NULL OR "tenantId" = ''
      `;
      const orphanLines = await tx.$executeRaw`
        UPDATE sale_lines SET "tenantId" = ${DEFAULT_TENANT_ID}
        WHERE "tenantId" IS NULL OR "tenantId" = ''
      `;

      console.log("✓ Default tenant ensured (id: default)");
      console.log(
        `  StockBatch rows updated: ${batches.count} (+ ${orphanBatches} orphan fix)`,
      );
      console.log(
        `  Sale rows updated: ${sales.count} (+ ${orphanSales} orphan fix)`,
      );
      console.log(
        `  SaleLine rows updated: ${lines.count} (+ ${orphanLines} orphan fix)`,
      );
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
