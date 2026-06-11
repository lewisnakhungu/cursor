/**
 * Adds database-level integrity constraints that Prisma's schema DSL
 * cannot express (audit #11): stock can never go negative, even if an
 * application bug slips through.
 *
 * Idempotent — safe to re-run. Usage:
 *   DATABASE_URL=<url> npx tsx prisma/add-constraints.ts
 */
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'stock_batches_quantity_nonnegative'
        ) THEN
          ALTER TABLE stock_batches
            ADD CONSTRAINT stock_batches_quantity_nonnegative
            CHECK ("quantityOnHand" >= 0);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'sale_lines_quantity_nonnegative'
        ) THEN
          ALTER TABLE sale_lines
            ADD CONSTRAINT sale_lines_quantity_nonnegative
            CHECK ("quantity" >= 0);
        END IF;
      END
      $$;
    `);
    console.log("✓ Non-negative stock constraints ensured");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
