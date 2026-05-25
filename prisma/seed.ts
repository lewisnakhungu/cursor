import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  config({ path: ".env.local" });
  config({ path: ".env" });
}

const STUB_FORM = "As per KEML listing";
const STUB_STRENGTH = "As per clinical need";
const CHUNK_SIZE = Number(process.env.SEED_CHUNK_SIZE ?? 500);

type KemlRow = {
  page: number;
  chapter: string;
  section: string;
  subsection: string;
  code: string;
  generic_name: string;
  dosage_form: string;
  strength: string;
  level_of_use: string;
};

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

function isStubRow(row: KemlRow): boolean {
  return row.dosage_form === STUB_FORM || row.strength === STUB_STRENGTH;
}

function mapRow(row: KemlRow) {
  const genericName = row.generic_name.trim();
  const dosageForm = (row.dosage_form ?? "").trim();
  const strength = (row.strength ?? "").trim();

  return {
    genericName,
    dosageForm,
    strength,
    searchKey: normalizeSearchKey(genericName, dosageForm, strength),
    kemlCode: row.code?.trim() || null,
    levelOfUse: row.level_of_use?.trim() || null,
    chapter: row.chapter?.trim() || null,
    section: row.section?.trim() || null,
    kemlPage: typeof row.page === "number" ? row.page : null,
    isStub: isStubRow(row),
  };
}

async function main(): Promise<void> {
  const jsonPath = resolve(__dirname, "../data/final_keml_2023.json");
  const raw = readFileSync(jsonPath, "utf-8");
  const rows = JSON.parse(raw) as KemlRow[];

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`No rows loaded from ${jsonPath}`);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 60_000,
    idleTimeoutMillis: 30_000,
    max: 5,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const payload = rows.map(mapRow);
  let inserted = 0;

  try {
    for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
      const chunk = payload.slice(i, i + CHUNK_SIZE);
      const result = await prisma.medicine.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      inserted += result.count;
    }

    const total = await prisma.medicine.count();
    const searchable = await prisma.medicine.count({
      where: { isStub: false },
    });

    console.log(
      JSON.stringify({
        sourceRows: rows.length,
        insertedThisRun: inserted,
        totalMedicines: total,
        searchableMedicines: searchable,
      }),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
