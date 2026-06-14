import { describe, expect, it } from "vitest";
import {
  computeAvgDailySales,
  computeDaysOfStockLeft,
  computeReorderPoint,
  computeSuggestedQty,
  computeTargetLevel,
  shouldSuggestReorder,
} from "@/lib/procurement/reorder-suggest";

describe("reorder-suggest", () => {
  it("computes average daily sales", () => {
    expect(computeAvgDailySales(300, 30)).toBe(10);
    expect(computeAvgDailySales(0, 30)).toBe(0);
  });

  it("computes ROP from velocity and lead time", () => {
    const policy = { leadTimeDays: 14, safetyStockDays: 3 };
    expect(computeReorderPoint(10, policy)).toBe(170);
  });

  it("respects explicit reorder point override", () => {
    expect(
      computeReorderPoint(10, {
        reorderPoint: 50,
        leadTimeDays: 14,
        safetyStockDays: 3,
      }),
    ).toBe(50);
  });

  it("suggests qty when below ROP", () => {
    const rop = 100;
    const target = 240;
    expect(computeSuggestedQty(80, rop, target)).toBe(160);
    expect(computeSuggestedQty(120, rop, target)).toBe(0);
  });

  it("computes days of stock left", () => {
    expect(computeDaysOfStockLeft(50, 10)).toBe(5);
    expect(computeDaysOfStockLeft(50, 0)).toBeNull();
  });

  it("flags reorder when at or below ROP", () => {
    expect(shouldSuggestReorder(10, 20, true)).toBe(true);
    expect(shouldSuggestReorder(25, 20, true)).toBe(false);
  });
});

describe("computeTargetLevel", () => {
  it("uses explicit target when set", () => {
    expect(
      computeTargetLevel(5, 50, {
        targetLevel: 200,
        leadTimeDays: 14,
        safetyStockDays: 3,
      }),
    ).toBe(200);
  });
});
