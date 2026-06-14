/**
 * Seeds hybrid catalog entries from docs/extended_hybrid_catalog.json:
 * - Enriches matched KEML rows with itemType, category, and brand aliases
 * - Inserts searchable rows for net-new or KEML-stub-only formulations
 * - Inserts net-new non-pharm items (consumables, diagnostics, etc.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { CatalogItemType, PrismaClient, AliasSource } from "../src/generated/prisma/client";
import { Pool } from "pg";
import {
  BULK_MATCH_HIGH_THRESHOLD,
  genericPrefixMatch,
  normalizeCatalogText,
  scoreCatalogMatch,
  type CatalogMatchMedicine,
} from "../src/lib/catalog-match";

if (!process.env.DATABASE_URL) {
  config({ path: ".env.local" });
  config({ path: ".env" });
}

type HybridEntry = {
  base_name: string;
  aliases: string[];
  category: string;
  item_type: string;
};

type MedicineRow = CatalogMatchMedicine & {
  id: string;
};

const CHUNK_SIZE = Number(process.env.SEED_CHUNK_SIZE ?? 500);
const MATCH_THRESHOLD = BULK_MATCH_HIGH_THRESHOLD;
const NON_PHARM_JSON_TYPES = new Set(["CONSUMABLE", "DIAGNOSTIC"]);

function toItemType(jsonType: string): CatalogItemType {
  return NON_PHARM_JSON_TYPES.has(jsonType)
    ? CatalogItemType.NON_PHARM
    : CatalogItemType.MEDICINE;
}

function normalizeSearchKey(
  genericName: string,
  dosageForm: string,
  strength: string,
): string {
  return [genericName, dosageForm, strength]
    .map((s) => normalizeCatalogText(s))
    .join("|");
}

function isStubFormulation(medicine: MedicineRow): boolean {
  const form = normalizeCatalogText(medicine.dosageForm);
  const strength = normalizeCatalogText(medicine.strength);
  return form.includes("as per keml") || strength.includes("as per clinical");
}

function isValidHybridEnrichMatch(
  entry: HybridEntry,
  medicine: MedicineRow,
  score: number,
): boolean {
  if (score < MATCH_THRESHOLD) return false;

  const baseNorm = normalizeCatalogText(entry.base_name);
  const genericNorm = normalizeCatalogText(medicine.genericName);
  if (!baseNorm || !genericNorm) return false;

  if (baseNorm.includes(genericNorm) && genericNorm.length >= 5) return true;
  if (genericPrefixMatch(entry.base_name, medicine.genericName)) return true;

  // KEML stubs (no real form/strength) — require the generic to lead the hybrid name.
  if (isStubFormulation(medicine)) {
    return baseNorm.startsWith(genericNorm);
  }

  return false;
}

function findBestMatch(
  entry: HybridEntry,
  catalog: MedicineRow[],
): { medicine: MedicineRow | null; score: number } {
  let best: MedicineRow | null = null;
  let bestScore = 0;

  for (const medicine of catalog) {
    const score = scoreCatalogMatch(entry.base_name, medicine);
    if (score > bestScore && isValidHybridEnrichMatch(entry, medicine, score)) {
      bestScore = score;
      best = medicine;
    }
  }

  return { medicine: best, score: bestScore };
}

function resolveMatchId(
  entry: HybridEntry,
  catalog: MedicineRow[],
): string | null {
  const { medicine, score } = findBestMatch(entry, catalog);
  if (medicine && score >= MATCH_THRESHOLD) return medicine.id;

  const searchKey = normalizeSearchKey(entry.base_name.trim(), "", "");
  const byKey = catalog.find((m) => m.searchKey === searchKey);
  if (byKey) return byKey.id;

  return null;
}

function collectAliasNames(entry: HybridEntry): string[] {
  return Array.from(
    new Set(
      [entry.base_name, ...(entry.aliases ?? [])]
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
    ),
  );
}

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

  const jsonPath = resolve(
    __dirname,
    "../docs/extended_hybrid_catalog.json",
  );
  const raw = readFileSync(jsonPath, "utf-8");
  const entries = JSON.parse(raw) as HybridEntry[];

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`No rows loaded from ${jsonPath}`);
  }

  const pool = await connectPool(url);
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const removed = await prisma.medicine.deleteMany({
    where: {
      kemlCode: null,
      dosageForm: "",
      strength: "",
      isStub: false,
      stockBatches: { none: {} },
      saleLines: { none: {} },
    },
  });

  await prisma.medicine.updateMany({
    data: {
      itemType: CatalogItemType.MEDICINE,
      category: null,
    },
  });

  const catalog = await prisma.medicine.findMany({
    where: { isStub: false },
    select: {
      id: true,
      genericName: true,
      dosageForm: true,
      strength: true,
      searchKey: true,
      aliases: { select: { name: true } },
    },
  });

  let enriched = 0;
  let inserted = 0;
  const aliasPayload: {
    medicineId: string;
    name: string;
    source: AliasSource;
  }[] = [];

  for (const entry of entries) {
    const baseName = entry.base_name?.trim();
    if (!baseName) continue;

    const itemType = toItemType(entry.item_type ?? "MEDICINE");
    const category = entry.category?.trim() || null;
    const aliasNames = collectAliasNames(entry);

    const matchId = resolveMatchId(entry, catalog);

    if (matchId) {
      await prisma.medicine.update({
        where: { id: matchId },
        data: { itemType, category },
      });
      enriched += 1;

      for (const name of aliasNames) {
        aliasPayload.push({
          medicineId: matchId,
          name,
          source: AliasSource.HYBRID,
        });
      }
      continue;
    }

    const searchKey = normalizeSearchKey(baseName, "", "");
    const created = await prisma.medicine.create({
      data: {
        genericName: baseName,
        dosageForm: "",
        strength: "",
        searchKey,
        itemType,
        category,
        isStub: false,
      },
    });

    catalog.push({
      id: created.id,
      genericName: created.genericName,
      dosageForm: created.dosageForm,
      strength: created.strength,
      searchKey: created.searchKey,
      aliases: [],
    });

    for (const name of aliasNames) {
      aliasPayload.push({
        medicineId: created.id,
        name,
        source: AliasSource.HYBRID,
      });
    }
    inserted += 1;
  }

  let aliasesInserted = 0;
  for (let i = 0; i < aliasPayload.length; i += CHUNK_SIZE) {
    const chunk = aliasPayload.slice(i, i + CHUNK_SIZE);
    const result = await prisma.medicineAlias.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    aliasesInserted += result.count;
  }

  const nonPharmCount = await prisma.medicine.count({
    where: { itemType: CatalogItemType.NON_PHARM, isStub: false },
  });

  console.log(
    JSON.stringify(
      {
        priorHybridRowsRemoved: removed.count,
        sourceEntries: entries.length,
        formulationsEnriched: enriched,
        newCatalogRowsInserted: inserted,
        aliasesInsertedThisRun: aliasesInserted,
        searchableNonPharmItems: nonPharmCount,
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
