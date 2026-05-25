/**
 * Seeds Kenyan market brand aliases from data/alias_names.json onto all KEML
 * formulation rows sharing the same genericName.
 */
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

type AliasRow = {
  generic_name: string;
  aliases: string[];
};

const CHUNK_SIZE = Number(process.env.SEED_CHUNK_SIZE ?? 500);

async function connectPool(url: string): Promise<Pool> {
  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: 60_000,
    idleTimeoutMillis: 30_000,
    max: 5,
  });
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      return pool;
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  throw new Error("Failed to connect to database");
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const jsonPath = resolve(__dirname, "../data/alias_names.json");
  const raw = readFileSync(jsonPath, "utf-8");
  const rows = JSON.parse(raw) as AliasRow[];

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`No rows loaded from ${jsonPath}`);
  }

  const pool = await connectPool(url);
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const medicines = await prisma.medicine.findMany({
    select: { id: true, genericName: true },
  });

  const byGeneric = new Map<string, string[]>();
  for (const med of medicines) {
    const key = med.genericName.trim().toLowerCase();
    const list = byGeneric.get(key) ?? [];
    list.push(med.id);
    byGeneric.set(key, list);
  }

  const payload: { medicineId: string; name: string }[] = [];
  let genericRowsProcessed = 0;
  let medicinesMatched = 0;
  let genericsUnmatched = 0;

  for (const row of rows) {
    const genericName = row.generic_name?.trim();
    if (!genericName) continue;

    const aliasNames = Array.from(
      new Set(
        (row.aliases ?? [])
          .map((a) => a.trim())
          .filter((a) => a.length > 0),
      ),
    );

    if (aliasNames.length === 0) continue;

    genericRowsProcessed += 1;

    const medicineIds = byGeneric.get(genericName.toLowerCase()) ?? [];
    if (medicineIds.length === 0) {
      genericsUnmatched += 1;
      continue;
    }

    medicinesMatched += medicineIds.length;

    for (const medicineId of medicineIds) {
      for (const name of aliasNames) {
        payload.push({ medicineId, name });
      }
    }
  }

  let aliasesInserted = 0;
  for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
    const chunk = payload.slice(i, i + CHUNK_SIZE);
    const result = await prisma.medicineAlias.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    aliasesInserted += result.count;
  }

  const totalAliases = await prisma.medicineAlias.count();

  console.log(
    JSON.stringify(
      {
        sourceGenericRows: rows.length,
        genericRowsProcessed,
        genericsUnmatched,
        medicineFormulationsMatched: medicinesMatched,
        aliasesInsertedThisRun: aliasesInserted,
        aliasesSkippedDuplicate: payload.length - aliasesInserted,
        totalAliasesInDb: totalAliases,
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
