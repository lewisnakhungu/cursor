/**
 * Brownfield Neon/local setup when db push fails on tenant FKs:
 * ensures default tenant exists, then syncs schema and backfills rows.
 *
 * Usage: DATABASE_URL=<neon> npx tsx prisma/neon-multitenant-setup.ts
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Pool } from "pg";
import { execSync } from "node:child_process";

config({ path: ".env.local" });
config({ path: ".env" });

const DEFAULT_TENANT_ID = "default";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const reg = await pool.query(
      `SELECT to_regclass('public.tenants') AS tenants`,
    );
    if (reg.rows[0]?.tenants) {
      await pool.query(
        `INSERT INTO tenants (id, name, slug, "createdAt")
         VALUES ($1, 'Default Facility', 'default', NOW())
         ON CONFLICT (id) DO NOTHING`,
        [DEFAULT_TENANT_ID],
      );
      console.log("✓ Default tenant row ensured before FK push");
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  // Destructive flag requires explicit opt-in: CONFIRM_DATA_LOSS=1
  const acceptDataLoss = process.env.CONFIRM_DATA_LOSS === "1";
  if (!acceptDataLoss) {
    console.warn(
      "Running db push WITHOUT --accept-data-loss. " +
        "If push fails on destructive changes, re-run with CONFIRM_DATA_LOSS=1.",
    );
  }
  execSync(
    `npx prisma db push${acceptDataLoss ? " --accept-data-loss" : ""}`,
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    },
  );

  const pool2 = new Pool({ connectionString: databaseUrl });
  const prisma2 = new PrismaClient({ adapter: new PrismaPg(pool2) });
  try {
    await prisma2.$transaction(async (tx) => {
      await tx.tenant.upsert({
        where: { id: DEFAULT_TENANT_ID },
        create: {
          id: DEFAULT_TENANT_ID,
          name: "Default Facility",
          slug: "default",
        },
        update: {},
      });

      await tx.$executeRaw`
        UPDATE stock_batches SET "tenantId" = ${DEFAULT_TENANT_ID}
        WHERE "tenantId" IS NULL OR "tenantId" = ''
      `;
      await tx.$executeRaw`
        UPDATE sales SET "tenantId" = ${DEFAULT_TENANT_ID}
        WHERE "tenantId" IS NULL OR "tenantId" = ''
      `;
      await tx.$executeRaw`
        UPDATE sale_lines SET "tenantId" = ${DEFAULT_TENANT_ID}
        WHERE "tenantId" IS NULL OR "tenantId" = ''
      `;
    });

    console.log("✓ Neon multitenant schema and default tenant ready");
  } finally {
    await prisma2.$disconnect();
    await pool2.end();
  }

  execSync("npx tsx prisma/seed-tenants.ts", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
