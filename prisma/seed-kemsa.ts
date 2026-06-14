/**
 * Seeds KEMSA supplier product names as catalog aliases.
 *
 * Prerequisite: npm run scrape:kemsa  (or commit data/kemsa/kemsa_product_list.json)
 *
 *   npm run db:seed-kemsa
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AliasSource,
  CatalogItemType,
  PrismaClient,
} from "../src/generated/prisma/client";
import { Pool } from "pg";
import {
  isLikelyNonPharm,
  isNonPharmPrefix,
  isUsableKemsaProductName,
  kemsaCategoryLabel,
  type KemsaProduct,
} from "../src/lib/kemsa-catalog";
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

type MedicineRow = CatalogMatchMedicine & { id: string };

const CHUNK_SIZE = Number(process.env.SEED_CHUNK_SIZE ?? 500);
const MATCH_THRESHOLD = BULK_MATCH_HIGH_THRESHOLD;

function isStubFormulation(medicine: MedicineRow): boolean {
  const form = normalizeCatalogText(medicine.dosageForm);
  const strength = normalizeCatalogText(medicine.strength);
  return form.includes("as per keml") || strength.includes("as per clinical");
}

function isValidKemsaMatch(
  productName: string,
  medicine: MedicineRow,
  score: number,
): boolean {
  if (score < MATCH_THRESHOLD) {
    // Relaxed path: generic anchor + compatible form, ignore strength for supplier aliases
    const nameNorm = normalizeCatalogText(productName);
    const genericNorm = normalizeCatalogText(medicine.genericName);
    if (genericNorm.length >= 5 && nameNorm.includes(genericNorm)) {
      const relaxedScore = scoreCatalogMatch(productName, {
        ...medicine,
        strength: productName.includes(medicine.strength) ? medicine.strength : "",
      });
      if (relaxedScore >= MATCH_THRESHOLD) return true;
      // Generic appears in KEMSA name — attach alias even across strengths
      return !formsConflictOnly(productName, medicine);
    }
    return false;
  }

  const nameNorm = normalizeCatalogText(productName);
  const genericNorm = normalizeCatalogText(medicine.genericName);
  if (nameNorm.includes(genericNorm) && genericNorm.length >= 5) return true;
  if (genericPrefixMatch(productName, medicine.genericName)) return true;

  if (isStubFormulation(medicine)) {
    return nameNorm.startsWith(genericNorm);
  }

  return false;
}

function formsConflictOnly(productName: string, medicine: MedicineRow): boolean {
  const queryForms = detectFormClasses(normalizeCatalogText(productName));
  const medForms = detectFormClasses(
    normalizeCatalogText(
      [medicine.genericName, medicine.dosageForm, medicine.strength].join(" "),
    ),
  );
  const pharmForms = ["tablet", "liquid", "injection", "topical"] as const;
  for (const form of pharmForms) {
    if (queryForms.has(form) && medForms.has(form)) return false;
    if (queryForms.has(form) && !medForms.has(form)) {
      const medHasOther = pharmForms.some((f) => f !== form && medForms.has(f));
      if (medHasOther) return true;
    }
  }
  return false;
}

function detectFormClasses(text: string): Set<string> {
  const classes = new Set<string>();
  if (/\bliquid\b/.test(text)) classes.add("liquid");
  if (/\btablet\b/.test(text)) classes.add("tablet");
  if (/\binjection\b/.test(text)) classes.add("injection");
  if (/\btopical\b/.test(text)) classes.add("topical");
  if (classes.size === 0) classes.add("other");
  return classes;
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

function findBestMatch(
  productName: string,
  catalog: MedicineRow[],
): { medicine: MedicineRow | null; score: number } {
  const nameNorm = normalizeCatalogText(productName);
  const candidates = catalog.filter((medicine) => {
    const genericNorm = normalizeCatalogText(medicine.genericName);
    return genericNorm.length >= 5 && nameNorm.includes(genericNorm);
  });

  const pool = candidates.length > 0 ? candidates : catalog;

  let best: MedicineRow | null = null;
  let bestScore = 0;

  for (const medicine of pool) {
    const score = scoreCatalogMatch(productName, medicine);
    if (!isValidKemsaMatch(productName, medicine, score)) continue;
    const effectiveScore = Math.max(score, MATCH_THRESHOLD);
    if (effectiveScore > bestScore) {
      bestScore = effectiveScore;
      best = medicine;
    }
  }

  return { medicine: best, score: bestScore };
}

function normalizeSearchKey(genericName: string): string {
  return normalizeCatalogText(genericName);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const jsonPath = resolve(__dirname, "../data/kemsa/kemsa_product_list.json");
  const raw = readFileSync(jsonPath, "utf-8");
  const parsed = JSON.parse(raw) as { products: KemsaProduct[] };
  const products = parsed.products ?? [];

  if (products.length === 0) {
    throw new Error(`No products in ${jsonPath} — run npm run scrape:kemsa first`);
  }

  const pool = await connectPool(url);
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const kemsaAliasesRemoved = await prisma.medicineAlias.deleteMany({
    where: { source: AliasSource.KEMSA },
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

  const aliasPayload: {
    medicineId: string;
    name: string;
    source: AliasSource;
  }[] = [];

  let matched = 0;
  let unmatched = 0;
  let enrichedCategory = 0;
  let inserted = 0;

  for (const product of products) {
    const name = product.productName.trim();
    if (!isUsableKemsaProductName(name)) continue;

    const { medicine, score } = findBestMatch(name, catalog);

    if (medicine && score >= MATCH_THRESHOLD) {
      matched += 1;

      const itemType = isNonPharmPrefix(product.codePrefix)
        ? CatalogItemType.NON_PHARM
        : CatalogItemType.MEDICINE;
      const category = kemsaCategoryLabel(product.category);

      await prisma.medicine.update({
        where: { id: medicine.id },
        data: {
          itemType,
          category: category || undefined,
        },
      });
      enrichedCategory += 1;

      aliasPayload.push({
        medicineId: medicine.id,
        name,
        source: AliasSource.KEMSA,
      });

      if (product.packSize.trim()) {
        aliasPayload.push({
          medicineId: medicine.id,
          name: `${name} (${product.packSize.trim()})`,
          source: AliasSource.KEMSA,
        });
      }
      continue;
    }

    if (!isLikelyNonPharm(product)) {
      // Insert KEMSA pharmaceutical SKU as searchable catalog row
      const searchKey = normalizeSearchKey(name);
      const existing = catalog.find((row) => row.searchKey === searchKey);
      const medicineId =
        existing?.id ??
        (
          await prisma.medicine.create({
            data: {
              genericName: name,
              dosageForm: "",
              strength: "",
              searchKey,
              itemType: CatalogItemType.MEDICINE,
              category: kemsaCategoryLabel(product.category) || null,
              isStub: false,
            },
          })
        ).id;

      if (!existing) {
        catalog.push({
          id: medicineId,
          genericName: name,
          dosageForm: "",
          strength: "",
          searchKey,
          aliases: [],
        });
        inserted += 1;
      }

      aliasPayload.push({ medicineId, name, source: AliasSource.KEMSA });
      if (product.packSize.trim()) {
        aliasPayload.push({
          medicineId,
          name: `${name} (${product.packSize.trim()})`,
          source: AliasSource.KEMSA,
        });
      }
      continue;
    }

    const searchKey = normalizeSearchKey(name);
    const existing = catalog.find((row) => row.searchKey === searchKey);
    const medicineId =
      existing?.id ??
      (
        await prisma.medicine.create({
          data: {
            genericName: name,
            dosageForm: "",
            strength: "",
            searchKey,
            itemType: CatalogItemType.NON_PHARM,
            category: kemsaCategoryLabel(product.category) || null,
            isStub: false,
          },
        })
      ).id;

    if (!existing) {
      catalog.push({
        id: medicineId,
        genericName: name,
        dosageForm: "",
        strength: "",
        searchKey,
        aliases: [],
      });
      inserted += 1;
    }

    aliasPayload.push({
      medicineId,
      name,
      source: AliasSource.KEMSA,
    });
    if (product.packSize.trim()) {
      aliasPayload.push({
        medicineId,
        name: `${name} (${product.packSize.trim()})`,
        source: AliasSource.KEMSA,
      });
    }
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

  console.log(
    JSON.stringify(
      {
        sourceProducts: products.length,
        priorKemsaAliasesRemoved: kemsaAliasesRemoved.count,
        catalogMatches: matched,
        unmatchedProducts: unmatched,
        newNonPharmRowsInserted: inserted,
        medicinesEnriched: enrichedCategory,
        kemsaAliasesInserted: aliasesInserted,
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
