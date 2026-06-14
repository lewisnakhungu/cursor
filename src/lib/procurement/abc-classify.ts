export type AbcClass = "A" | "B" | "C";

/**
 * Pareto-style ABC from ranked sales volume (highest first).
 * Top ~20% of items → A, next ~30% → B, remainder → C.
 */
export function classifyAbcByRank(rankIndex: number, totalItems: number): AbcClass {
  if (totalItems <= 0) return "C";
  const percentile = (rankIndex + 1) / totalItems;
  if (percentile <= 0.2) return "A";
  if (percentile <= 0.5) return "B";
  return "C";
}

export function buildAbcRankMap(
  items: Array<{ medicineId: string; unitsSold: number }>,
): Map<string, AbcClass> {
  const sorted = [...items].sort((a, b) => b.unitsSold - a.unitsSold);
  const total = sorted.length;
  const map = new Map<string, AbcClass>();
  for (let i = 0; i < sorted.length; i++) {
    map.set(sorted[i].medicineId, classifyAbcByRank(i, total));
  }
  return map;
}
