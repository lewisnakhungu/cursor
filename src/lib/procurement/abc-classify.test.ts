import { describe, expect, it } from "vitest";
import {
  buildAbcRankMap,
  classifyAbcByRank,
} from "@/lib/procurement/abc-classify";

describe("abc-classify", () => {
  it("assigns A to top 20%", () => {
    expect(classifyAbcByRank(0, 10)).toBe("A");
    expect(classifyAbcByRank(1, 10)).toBe("A");
    expect(classifyAbcByRank(2, 10)).toBe("B");
  });

  it("builds rank map from sales volume", () => {
    const map = buildAbcRankMap([
      { medicineId: "m1", unitsSold: 100 },
      { medicineId: "m2", unitsSold: 50 },
      { medicineId: "m3", unitsSold: 10 },
      { medicineId: "m4", unitsSold: 5 },
      { medicineId: "m5", unitsSold: 1 },
    ]);
    expect(map.get("m1")).toBe("A");
    expect(map.get("m5")).toBe("C");
  });
});
