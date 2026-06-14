/**
 * Purges polluted seed aliases and resets hybrid category tags on KEML rows.
 * Run before re-seeding: npm run db:cleanup-catalog-aliases
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { AliasSource, PrismaClient } from "../src/generated/prisma/client";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  config({ path: ".env.local" });
  config({ path: ".env" });
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const removed = await prisma.medicineAlias.deleteMany({
    where: {
      source: {
        in: [AliasSource.BRAND_SEED, AliasSource.HYBRID, AliasSource.KEMSA],
      },
    },
  });

  const categoriesReset = await prisma.medicine.updateMany({
    where: { kemlCode: { not: null } },
    data: { category: null },
  });

  console.log(
    JSON.stringify(
      {
        seedAliasesRemoved: removed.count,
        kemlCategoriesReset: categoriesReset.count,
        nextStep: "npm run db:seed-catalog",
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
