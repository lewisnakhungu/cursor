"use server";

import { prisma } from "@/lib/prisma";
import type {
  ActionResult,
  CatalogMedicine,
  StockBatchView,
} from "@/lib/types";
import type { StockUnitCode } from "@/lib/stock-unit";
import { runAction } from "@/lib/actions/utils";

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

export async function searchCatalog(
  query: string,
): Promise<ActionResult<CatalogMedicine[]>> {
  return runAction("searchCatalog", async () => {
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
      orderBy: [{ genericName: "asc" }, { dosageForm: "asc" }],
      take: 20,
    });

    return medicines.map((medicine) => {
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
      };
    });
  });
}

export async function getBatchesForMedicine(
  medicineId: string,
): Promise<ActionResult<StockBatchView[]>> {
  return runAction("getBatchesForMedicine", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const batches = await prisma.stockBatch.findMany({
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
  });
}
