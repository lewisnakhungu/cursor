import type { CatalogItemType } from "@/lib/types";

export function itemTypeLabel(itemType: CatalogItemType): string {
  return itemType === "NON_PHARM" ? "Non-pharm" : "Medicine";
}

export function resolveLineItemType(line: {
  itemType?: CatalogItemType | null;
  medicine?: { itemType: CatalogItemType } | null;
}): CatalogItemType {
  return line.itemType ?? line.medicine?.itemType ?? "MEDICINE";
}

export type RevenueByItemType = {
  medicineRevenue: number;
  nonPharmRevenue: number;
  medicineUnitsSold: number;
  nonPharmUnitsSold: number;
};

export function emptyRevenueByItemType(): RevenueByItemType {
  return {
    medicineRevenue: 0,
    nonPharmRevenue: 0,
    medicineUnitsSold: 0,
    nonPharmUnitsSold: 0,
  };
}

export function roundKes(n: number): number {
  return Math.round(n * 100) / 100;
}

export function accumulateRevenueByItemType(
  acc: RevenueByItemType,
  itemType: CatalogItemType,
  quantity: number,
  revenue: number,
): void {
  if (itemType === "NON_PHARM") {
    acc.nonPharmRevenue += revenue;
    acc.nonPharmUnitsSold += quantity;
  } else {
    acc.medicineRevenue += revenue;
    acc.medicineUnitsSold += quantity;
  }
}

export function finalizeRevenueByItemType(
  acc: RevenueByItemType,
): RevenueByItemType {
  return {
    medicineRevenue: roundKes(acc.medicineRevenue),
    nonPharmRevenue: roundKes(acc.nonPharmRevenue),
    medicineUnitsSold: acc.medicineUnitsSold,
    nonPharmUnitsSold: acc.nonPharmUnitsSold,
  };
}
