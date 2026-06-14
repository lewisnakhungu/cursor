"use server";

import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/auth/guards";
import { AppError } from "@/lib/errors";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type {
  ActionResult,
  BulkCatalogMatch,
  CatalogMedicine,
  MatchConfidence,
  StockBatchView,
} from "@/lib/types";
import {
  summarizeStockByUnit,
  type StockUnitCode,
} from "@/lib/stock-unit";
import type { CatalogStockAvailability } from "@/lib/types";
import { runAction } from "@/lib/actions/utils";

export type SearchCatalogOptions = {
  /** Attach live stock totals per formulation (POS dispense). */
  withStock?: boolean;
};

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

function resolveMatchedBrand(
  query: string,
  genericName: string,
  aliasNames: string[],
): string | null {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return null;

  const genericMatches = genericName.toLowerCase().includes(q);
  const matchedAlias = aliasNames.find((name) =>
    name.toLowerCase().includes(q),
  );

  if (matchedAlias && !genericMatches) {
    return matchedAlias;
  }

  return null;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

async function loadStockByMedicineId(
  medicineIds: string[],
  db: TenantPrismaClient,
): Promise<Map<string, CatalogStockAvailability>> {
  const map = new Map<string, CatalogStockAvailability>();
  if (medicineIds.length === 0) return map;

  const today = startOfToday();
  const batches = await db.stockBatch.findMany({
    where: {
      medicineId: { in: medicineIds },
      quantityOnHand: { gt: 0 },
      expiryDate: { gte: today },
    },
    select: {
      medicineId: true,
      quantityOnHand: true,
      stockUnit: true,
      unitsPerPack: true,
    },
  });

  const grouped = new Map<
    string,
    Array<{
      quantityOnHand: number;
      stockUnit: StockUnitCode;
      unitsPerPack: number | null;
    }>
  >();

  for (const batch of batches) {
    const rows = grouped.get(batch.medicineId) ?? [];
    rows.push({
      quantityOnHand: batch.quantityOnHand,
      stockUnit: batch.stockUnit as StockUnitCode,
      unitsPerPack: batch.unitsPerPack,
    });
    grouped.set(batch.medicineId, rows);
  }

  for (const id of medicineIds) {
    const rows = grouped.get(id) ?? [];
    map.set(id, summarizeStockByUnit(rows));
  }

  return map;
}

export async function searchCatalog(
  query: string,
  options?: SearchCatalogOptions,
): Promise<ActionResult<CatalogMedicine[]>> {
  const withStock = options?.withStock === true;
  const ctx = await requireTenantContext(
    withStock ? "dispense.sale" : "receive.stock",
  );
  return runAction(
    "searchCatalog",
    async () => {
      const { db } = ctx;
      const normalized = normalizeQuery(query);

      if (normalized.length < 2) {
        return [];
      }

      const medicines = await prisma.medicine.findMany({
        where: {
          isStub: false,
          OR: [
            { searchKey: { contains: normalized } },
            { genericName: { contains: query, mode: "insensitive" } },
            {
              aliases: {
                some: { name: { contains: query, mode: "insensitive" } },
              },
            },
          ],
        },
        include: {
          aliases: {
            select: { name: true },
            orderBy: { name: "asc" },
          },
        },
        orderBy: [
          { genericName: "asc" },
          { dosageForm: "asc" },
          { strength: "asc" },
        ],
        take: withStock ? 30 : 20,
      });

      const stockByMedicine = withStock
        ? await loadStockByMedicineId(
            medicines.map((m) => m.id),
            db,
          )
        : null;

      const rows = medicines.map((medicine) => {
        const aliasNames = medicine.aliases.map((a) => a.name);
        return {
          id: medicine.id,
          genericName: medicine.genericName,
          dosageForm: medicine.dosageForm,
          strength: medicine.strength,
          levelOfUse: medicine.levelOfUse,
          aliases: aliasNames,
          matchedBrand: resolveMatchedBrand(
            query,
            medicine.genericName,
            aliasNames,
          ),
          stock: stockByMedicine?.get(medicine.id),
        };
      });

      if (!withStock) {
        return rows;
      }

      return rows.sort((a, b) => {
        const aStock = a.stock?.hasStock ? 1 : 0;
        const bStock = b.stock?.hasStock ? 1 : 0;
        if (bStock !== aStock) return bStock - aStock;
        if (a.genericName !== b.genericName) {
          return a.genericName.localeCompare(b.genericName);
        }
        return `${a.dosageForm} ${a.strength}`.localeCompare(
          `${b.dosageForm} ${b.strength}`,
        );
      });
    },
    { tenantId: ctx.tenantId },
  );
}

type MedicineWithAliases = {
  id: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  levelOfUse: string | null;
  searchKey: string;
  aliases: Array<{ name: string }>;
};

function scoreCatalogMatch(rawName: string, medicine: MedicineWithAliases): number {
  const q = rawName.trim().toLowerCase();
  const normalized = normalizeQuery(rawName);
  if (!normalized || q.length < 2) return 0;

  const generic = medicine.genericName.toLowerCase();
  const { searchKey } = medicine;

  if (generic === q) return 100;
  if (medicine.aliases.some((a) => a.name.toLowerCase() === q)) return 100;
  if (searchKey === normalized) return 100;

  if (searchKey.startsWith(normalized)) return 70;
  if (generic.startsWith(q)) return 65;

  if (searchKey.includes(normalized)) return 40;
  if (generic.includes(q)) return 35;
  if (medicine.aliases.some((a) => a.name.toLowerCase().includes(q))) return 35;

  const tokens = normalized.split(" ").filter((t) => t.length >= 2);
  if (tokens.length > 0 && tokens.every((t) => searchKey.includes(t))) {
    return 30;
  }

  return 0;
}

function confidenceFromScore(score: number): MatchConfidence {
  if (score >= 100) return "HIGH";
  if (score >= 30) return "LOW";
  return "NONE";
}

function toCatalogMedicine(
  medicine: MedicineWithAliases,
  rawName: string,
): CatalogMedicine {
  const aliasNames = medicine.aliases.map((a) => a.name);
  return {
    id: medicine.id,
    genericName: medicine.genericName,
    dosageForm: medicine.dosageForm,
    strength: medicine.strength,
    levelOfUse: medicine.levelOfUse,
    aliases: aliasNames,
    matchedBrand: resolveMatchedBrand(rawName, medicine.genericName, aliasNames),
  };
}

/**
 * Matches many CSV product names against KEML + aliases in one read-only pass.
 * Loads the formulary once and scores in memory for speed.
 */
export async function bulkMatchCatalog(
  rawNames: string[],
): Promise<ActionResult<BulkCatalogMatch[]>> {
  const ctx = await requireTenantContext("receive.stock");
  return runAction(
    "bulkMatchCatalog",
    async () => {
      if (rawNames.length === 0) return [];
      if (rawNames.length > 100) {
        throw new AppError(
          "Maximum 100 names per bulk match request",
          "VALIDATION",
        );
      }

      const catalog = await prisma.medicine.findMany({
        where: { isStub: false },
        select: {
          id: true,
          genericName: true,
          dosageForm: true,
          strength: true,
          levelOfUse: true,
          searchKey: true,
          aliases: { select: { name: true } },
        },
      });

      return rawNames.map((rawName) => {
        let best: MedicineWithAliases | null = null;
        let bestScore = 0;

        for (const medicine of catalog) {
          const score = scoreCatalogMatch(rawName, medicine);
          if (score > bestScore) {
            bestScore = score;
            best = medicine;
          }
        }

        const matchConfidence = confidenceFromScore(bestScore);
        if (!best || matchConfidence === "NONE") {
          return {
            rawName,
            medicineId: null,
            matchConfidence: "NONE" as const,
            medicine: null,
          };
        }

        return {
          rawName,
          medicineId: best.id,
          matchConfidence,
          medicine: toCatalogMedicine(best, rawName),
        };
      });
    },
    { tenantId: ctx.tenantId },
  );
}

export async function getBatchesForMedicine(
  medicineId: string,
): Promise<ActionResult<StockBatchView[]>> {
  const ctx = await requireTenantContext("dispense.sale");
  return runAction(
    "getBatchesForMedicine",
    async () => {
      const { db } = ctx;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const batches = await db.stockBatch.findMany({
        where: {
          medicineId,
          quantityOnHand: { gt: 0 },
          expiryDate: { gte: today },
        },
        orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
      });

      return batches.map((batch) => ({
        id: batch.id,
        medicineId: batch.medicineId,
        batchNumber: batch.batchNumber,
        quantityOnHand: batch.quantityOnHand,
        expiryDate: batch.expiryDate.toISOString().slice(0, 10),
        receivedAt: batch.receivedAt.toISOString(),
        supplierCost: batch.supplierCost?.toString() ?? null,
        retailSalePrice: batch.retailSalePrice?.toString() ?? null,
        supplierName: batch.supplierName,
        stockUnit: batch.stockUnit as StockUnitCode,
        unitsPerPack: batch.unitsPerPack,
      }));
    },
    { tenantId: ctx.tenantId },
  );
}
