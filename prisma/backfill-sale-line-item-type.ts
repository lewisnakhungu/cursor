/**
 * Backfill sale_lines.itemType from the linked medicine row.
 * Safe to re-run after db push adds the column with default MEDICINE.
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });
config({ path: ".env" });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const updated = await prisma.$executeRaw`
      UPDATE sale_lines AS sl
      SET "itemType" = m."itemType"
      FROM medicines AS m
      WHERE sl."medicineId" = m.id
        AND sl."itemType" IS DISTINCT FROM m."itemType"
    `;

    const counts = await prisma.$queryRaw<
      Array<{ itemType: string; count: bigint }>
    >`
      SELECT "itemType", COUNT(*)::bigint AS count
      FROM sale_lines
      GROUP BY "itemType"
      ORDER BY "itemType"
    `;

    console.log(
      JSON.stringify(
        {
          rowsUpdated: Number(updated),
          distribution: counts.map((row) => ({
            itemType: row.itemType,
            count: Number(row.count),
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
