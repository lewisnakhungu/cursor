import { describe, expect, it } from "vitest";
import {
  accumulateRevenueByItemType,
  emptyRevenueByItemType,
  finalizeRevenueByItemType,
  itemTypeLabel,
  resolveLineItemType,
} from "@/lib/report-item-type";

describe("itemTypeLabel", () => {
  it("labels medicine and non-pharm", () => {
    expect(itemTypeLabel("MEDICINE")).toBe("Medicine");
    expect(itemTypeLabel("NON_PHARM")).toBe("Non-pharm");
  });
});

describe("resolveLineItemType", () => {
  it("prefers the sale line snapshot", () => {
    expect(
      resolveLineItemType({
        itemType: "NON_PHARM",
        medicine: { itemType: "MEDICINE" },
      }),
    ).toBe("NON_PHARM");
  });

  it("falls back to medicine then medicine default", () => {
    expect(
      resolveLineItemType({ medicine: { itemType: "NON_PHARM" } }),
    ).toBe("NON_PHARM");
    expect(resolveLineItemType({})).toBe("MEDICINE");
  });
});

describe("accumulateRevenueByItemType", () => {
  it("splits revenue and units by item type", () => {
    const acc = emptyRevenueByItemType();
    accumulateRevenueByItemType(acc, "MEDICINE", 2, 100);
    accumulateRevenueByItemType(acc, "NON_PHARM", 3, 45.5);

    expect(finalizeRevenueByItemType(acc)).toEqual({
      medicineRevenue: 100,
      nonPharmRevenue: 45.5,
      medicineUnitsSold: 2,
      nonPharmUnitsSold: 3,
    });
  });
});
