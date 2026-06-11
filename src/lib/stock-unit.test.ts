import { describe, expect, it } from "vitest";
import {
  formatQuantityWithUnit,
  isStockUnitCode,
  normalizeStockUnit,
  stockUnitPlural,
  suggestStockUnitFromDosageForm,
  summarizeCartByUnit,
  summarizeStockByUnit,
} from "@/lib/stock-unit";

describe("normalizeStockUnit", () => {
  it("passes through valid codes", () => {
    expect(normalizeStockUnit("BOX")).toBe("BOX");
  });

  it("falls back to UNIT for legacy/null values", () => {
    expect(normalizeStockUnit(null)).toBe("UNIT");
    expect(normalizeStockUnit(undefined)).toBe("UNIT");
    expect(normalizeStockUnit("PACKET")).toBe("UNIT");
  });
});

describe("isStockUnitCode", () => {
  it("accepts all enum values and rejects garbage", () => {
    expect(isStockUnitCode("TABLET")).toBe(true);
    expect(isStockUnitCode("tablet")).toBe(false);
    expect(isStockUnitCode("")).toBe(false);
  });
});

describe("formatQuantityWithUnit", () => {
  it("singular vs plural", () => {
    expect(formatQuantityWithUnit(1, "TABLET")).toBe("1 tablet");
    expect(formatQuantityWithUnit(4, "TABLET")).toBe("4 tablets");
  });

  it("expands pack contents for BOX with unitsPerPack", () => {
    expect(formatQuantityWithUnit(2, "BOX", 100)).toBe(
      "2 boxes (200 tablets/pieces)",
    );
  });

  it("does not expand packs for non-pack units", () => {
    expect(formatQuantityWithUnit(3, "BOTTLE", 100)).toBe("3 bottles");
  });

  it("ignores unitsPerPack of 1 or null", () => {
    expect(formatQuantityWithUnit(2, "BOX", 1)).toBe("2 boxes");
    expect(formatQuantityWithUnit(2, "BOX", null)).toBe("2 boxes");
  });
});

describe("stockUnitPlural", () => {
  it("uses lowercase label for singular", () => {
    expect(stockUnitPlural("BOX", 1)).toBe("box / carton");
    expect(stockUnitPlural("BOX", 2)).toBe("boxes");
  });
});

describe("summarizeStockByUnit", () => {
  it("reports out of stock for empty rows", () => {
    const result = summarizeStockByUnit([]);
    expect(result.hasStock).toBe(false);
    expect(result.summary).toBe("Out of stock");
  });

  it("aggregates same-unit batches", () => {
    const result = summarizeStockByUnit([
      { quantityOnHand: 100, stockUnit: "TABLET", unitsPerPack: null },
      { quantityOnHand: 140, stockUnit: "TABLET", unitsPerPack: null },
    ]);
    expect(result.totalOnHand).toBe(240);
    expect(result.summary).toBe("240 tablets");
    expect(result.mixedUnits).toBe(false);
  });

  it("flags mixed units and joins summaries", () => {
    const result = summarizeStockByUnit([
      { quantityOnHand: 10, stockUnit: "TABLET", unitsPerPack: null },
      { quantityOnHand: 2, stockUnit: "BOX", unitsPerPack: 100 },
    ]);
    expect(result.mixedUnits).toBe(true);
    expect(result.summary).toContain("10 tablets");
    expect(result.summary).toContain("2 boxes");
  });
});

describe("summarizeCartByUnit", () => {
  it("handles empty cart", () => {
    expect(summarizeCartByUnit([])).toBe("0 items");
  });

  it("totals quantities per unit", () => {
    expect(
      summarizeCartByUnit([
        { quantity: 3, stockUnit: "TABLET" },
        { quantity: 2, stockUnit: "TABLET" },
        { quantity: 1, stockUnit: "BOTTLE" },
      ]),
    ).toBe("5 tablets + 1 bottle");
  });
});

describe("suggestStockUnitFromDosageForm", () => {
  it.each([
    ["Tablet (scored)", "TABLET"],
    ["Capsule", "CAPSULE"],
    ["Injection", "VIAL"],
    ["Oral suspension", "BOTTLE"],
    ["Cream", "TUBE"],
    ["Sachet", "SACHET"],
    ["Suppository", "UNIT"],
  ])("%s → %s", (form, expected) => {
    expect(suggestStockUnitFromDosageForm(form)).toBe(expected);
  });
});
