/**
 * Stock counting units — one integer qty always means "one stockUnit"
 * (optionally with unitsPerPack for display, e.g. boxes of 100 tablets).
 */
export const STOCK_UNIT_VALUES = [
  "TABLET",
  "CAPSULE",
  "STRIP",
  "BOX",
  "BOTTLE",
  "VIAL",
  "TUBE",
  "SACHET",
  "UNIT",
] as const;

export type StockUnitCode = (typeof STOCK_UNIT_VALUES)[number];

export type StockUnitOption = {
  value: StockUnitCode;
  label: string;
  plural: string;
  /** Show optional "items per pack" field when receiving */
  supportsPackSize: boolean;
};

export const STOCK_UNIT_OPTIONS: readonly StockUnitOption[] = [
  { value: "TABLET", label: "Tablet", plural: "tablets", supportsPackSize: false },
  { value: "CAPSULE", label: "Capsule", plural: "capsules", supportsPackSize: false },
  { value: "STRIP", label: "Strip", plural: "strips", supportsPackSize: true },
  { value: "BOX", label: "Box / carton", plural: "boxes", supportsPackSize: true },
  { value: "BOTTLE", label: "Bottle", plural: "bottles", supportsPackSize: false },
  { value: "VIAL", label: "Vial / ampoule", plural: "vials", supportsPackSize: false },
  { value: "TUBE", label: "Tube", plural: "tubes", supportsPackSize: false },
  { value: "SACHET", label: "Sachet", plural: "sachets", supportsPackSize: false },
  { value: "UNIT", label: "Unit (generic)", plural: "units", supportsPackSize: true },
] as const;

const UNIT_MAP = new Map(
  STOCK_UNIT_OPTIONS.map((o) => [o.value, o] as const),
);

export function isStockUnitCode(value: string): value is StockUnitCode {
  return (STOCK_UNIT_VALUES as readonly string[]).includes(value);
}

export function stockUnitMeta(unit: StockUnitCode): StockUnitOption {
  return UNIT_MAP.get(unit) ?? UNIT_MAP.get("UNIT")!;
}

/** Safe fallback for API/legacy rows missing stockUnit */
export function normalizeStockUnit(
  unit: string | null | undefined,
): StockUnitCode {
  if (unit && isStockUnitCode(unit)) return unit;
  return "UNIT";
}

export function summarizeStockByUnit(
  rows: Array<{
    quantityOnHand: number;
    stockUnit: StockUnitCode | string;
    unitsPerPack: number | null;
  }>,
): {
  hasStock: boolean;
  totalOnHand: number;
  batchCount: number;
  summary: string;
  mixedUnits: boolean;
} {
  if (rows.length === 0) {
    return {
      hasStock: false,
      totalOnHand: 0,
      batchCount: 0,
      summary: "Out of stock",
      mixedUnits: false,
    };
  }

  const byUnit = new Map<
    StockUnitCode,
    { qty: number; unitsPerPack: number | null }
  >();

  for (const row of rows) {
    const unit = normalizeStockUnit(row.stockUnit);
    const existing = byUnit.get(unit);
    if (existing) {
      existing.qty += row.quantityOnHand;
    } else {
      byUnit.set(unit, {
        qty: row.quantityOnHand,
        unitsPerPack: row.unitsPerPack,
      });
    }
  }

  const parts = Array.from(byUnit.entries()).map(([unit, { qty, unitsPerPack }]) =>
    formatQuantityWithUnit(qty, unit, unitsPerPack),
  );

  return {
    hasStock: true,
    totalOnHand: rows.reduce((sum, row) => sum + row.quantityOnHand, 0),
    batchCount: rows.length,
    summary: parts.join(" + "),
    mixedUnits: byUnit.size > 1,
  };
}

export function summarizeCartByUnit(
  items: Array<{ quantity: number; stockUnit: StockUnitCode | string }>,
): string {
  if (items.length === 0) return "0 items";
  const totals = new Map<StockUnitCode, number>();
  for (const item of items) {
    const u = normalizeStockUnit(item.stockUnit);
    totals.set(u, (totals.get(u) ?? 0) + item.quantity);
  }
  return Array.from(totals.entries())
    .map(([unit, qty]) => formatQuantityWithUnit(qty, unit))
    .join(" + ");
}

export function stockUnitPlural(unit: StockUnitCode, qty: number): string {
  const meta = stockUnitMeta(unit);
  return qty === 1 ? meta.label.toLowerCase() : meta.plural;
}

/** e.g. "30 tablets" or "2 boxes (200 tablets)" */
export function formatQuantityWithUnit(
  qty: number,
  unit: StockUnitCode,
  unitsPerPack?: number | null,
): string {
  const plural = stockUnitPlural(unit, qty);
  const base = `${qty} ${plural}`;
  if (
    unitsPerPack != null &&
    unitsPerPack > 1 &&
    (unit === "BOX" || unit === "STRIP" || unit === "UNIT")
  ) {
    const inner = qty * unitsPerPack;
    return `${base} (${inner} tablets/pieces)`;
  }
  return base;
}

/** e.g. "KES 8.00 per tablet" */
export function formatPricePerUnitLabel(
  priceKes: number,
  unit: StockUnitCode,
): string {
  const meta = stockUnitMeta(unit);
  return `KES ${priceKes.toFixed(2)} per ${meta.label.toLowerCase()}`;
}

export function formatPricePerUnitShort(
  priceKes: number | string,
  unit: StockUnitCode,
): string {
  const n =
    typeof priceKes === "string" ? Number.parseFloat(priceKes) : priceKes;
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}/${stockUnitMeta(unit).label.toLowerCase()}`;
}

/** Suggest a default unit from KEML dosage form text */
export function suggestStockUnitFromDosageForm(dosageForm: string): StockUnitCode {
  const f = dosageForm.toLowerCase();
  if (f.includes("tablet")) return "TABLET";
  if (f.includes("capsule")) return "CAPSULE";
  if (f.includes("vial") || f.includes("ampoule") || f.includes("injection"))
    return "VIAL";
  if (
    f.includes("bottle") ||
    f.includes("syrup") ||
    f.includes("suspension") ||
    f.includes("solution")
  )
    return "BOTTLE";
  if (f.includes("tube") || f.includes("cream") || f.includes("ointment"))
    return "TUBE";
  if (f.includes("sachet")) return "SACHET";
  if (f.includes("strip")) return "STRIP";
  return "UNIT";
}

export function stockUnitOptionSupportsPackSize(unit: StockUnitCode): boolean {
  return stockUnitMeta(unit).supportsPackSize;
}
