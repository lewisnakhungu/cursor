/**
 * Creates demo facility tenants for local multi-tenant testing.
 * Set TENANT_ID to one of these ids (or slug) when running the app.
 *
 * Usage: npx tsx prisma/seed-tenants.ts
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Pool } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const DEMO_TENANTS = [
  { id: "default", name: "Default Facility", slug: "default" },
  { id: "facility-a", name: "Kakamega General Pharmacy", slug: "kakamega" },
  { id: "facility-b", name: "Kisumu County Dispensary", slug: "kisumu" },
  { id: "facility-c", name: "Nairobi Central Pharmacy", slug: "nairobi" },
  { id: "facility-d", name: "Mombasa Coast Clinic", slug: "mombasa" },
] as const;

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    for (const tenant of DEMO_TENANTS) {
      await prisma.tenant.upsert({
        where: { id: tenant.id },
        create: tenant,
        update: { name: tenant.name, slug: tenant.slug },
      });
      console.log(`✓ ${tenant.slug} (${tenant.id})`);
    }
    console.log("\nUse TENANT_ID=facility-a (etc.) in .env.local to switch facilities.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
