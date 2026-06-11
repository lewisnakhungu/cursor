/**
 * One-off data fix (audit D1): the KEML source files carried a
 * "Ww Warfarin" OCR typo that was seeded into the medicines table.
 * Renames the medicine, recomputes its searchKey, and fixes the
 * denormalized copies on sale lines and aliases.
 *
 * Usage: DATABASE_URL=<url> npx tsx prisma/fix-warfarin.ts
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Pool } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const BAD_NAME = "Ww Warfarin";
const GOOD_NAME = "Warfarin";

function normalizeSearchKey(
  genericName: string,
  dosageForm: string,
  strength: string,
): string {
  return [genericName, dosageForm, strength]
    .map((s) =>
      s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9+]+/g, " ")
        .trim(),
    )
    .join("|");
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const affected = await prisma.medicine.findMany({
      where: { genericName: BAD_NAME },
    });

    if (affected.length === 0) {
      console.log("✓ No 'Ww Warfarin' rows found — nothing to fix");
    }

    for (const medicine of affected) {
      const newSearchKey = normalizeSearchKey(
        GOOD_NAME,
        medicine.dosageForm,
        medicine.strength,
      );

      const collision = await prisma.medicine.findUnique({
        where: { searchKey: newSearchKey },
      });
      if (collision && collision.id !== medicine.id) {
        console.warn(
          `! Skipping ${medicine.id}: a correct Warfarin row already exists (${collision.id})`,
        );
        continue;
      }

      await prisma.medicine.update({
        where: { id: medicine.id },
        data: { genericName: GOOD_NAME, searchKey: newSearchKey },
      });
      console.log(`✓ Renamed medicine ${medicine.id} → "${GOOD_NAME}"`);
    }

    const lines = await prisma.saleLine.updateMany({
      where: { genericName: BAD_NAME },
      data: { genericName: GOOD_NAME },
    });
    if (lines.count > 0) {
      console.log(`✓ Fixed ${lines.count} sale line snapshot(s)`);
    }

    const aliases = await prisma.medicineAlias.deleteMany({
      where: { name: BAD_NAME },
    });
    if (aliases.count > 0) {
      console.log(`✓ Removed ${aliases.count} typo alias row(s)`);
    }

    console.log("✓ Warfarin data fix complete");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
