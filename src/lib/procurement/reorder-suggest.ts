import type { StockUnitCode } from "@/lib/stock-unit";

export const DEFAULT_LEAD_TIME_DAYS = 14;
export const DEFAULT_SAFETY_STOCK_DAYS = 3;
export const SALES_LOOKBACK_DAYS = 30;
export const EXPIRY_WATCH_DAYS = 90;

export type ReorderPolicyInput = {
  reorderPoint?: number | null;
  targetLevel?: number | null;
  leadTimeDays: number;
  safetyStockDays: number;
};

export type MedicineStockSnapshot = {
  medicineId: string;
  currentStock: number;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
};

export type LineSourceMeta = {
  currentStock: number;
  reorderPoint: number;
  targetLevel: number;
  avgDailySales: number;
  daysOfStockLeft: number | null;
  abcClass?: "A" | "B" | "C";
};

export function computeAvgDailySales(
  unitsSold: number,
  lookbackDays: number = SALES_LOOKBACK_DAYS,
): number {
  if (lookbackDays <= 0) return 0;
  return unitsSold / lookbackDays;
}

export function computeReorderPoint(
  avgDaily: number,
  policy: ReorderPolicyInput,
): number {
  if (policy.reorderPoint != null && policy.reorderPoint > 0) {
    return policy.reorderPoint;
  }
  return (
    avgDaily * policy.leadTimeDays + avgDaily * policy.safetyStockDays
  );
}

export function computeTargetLevel(
  avgDaily: number,
  reorderPoint: number,
  policy: ReorderPolicyInput,
): number {
  if (policy.targetLevel != null && policy.targetLevel > 0) {
    return policy.targetLevel;
  }
  return reorderPoint + avgDaily * policy.leadTimeDays;
}

export function computeSuggestedQty(
  currentStock: number,
  reorderPoint: number,
  targetLevel: number,
): number {
  if (currentStock > reorderPoint) return 0;
  return Math.ceil(Math.max(0, targetLevel - currentStock));
}

export function computeDaysOfStockLeft(
  currentStock: number,
  avgDaily: number,
): number | null {
  if (avgDaily <= 0) return null;
  return Math.floor(currentStock / avgDaily);
}

export function shouldSuggestReorder(
  currentStock: number,
  reorderPoint: number,
  hasRecentSales: boolean,
): boolean {
  if (currentStock <= reorderPoint) return true;
  return currentStock <= 0 && hasRecentSales;
}

export function defaultPolicy(): ReorderPolicyInput {
  return {
    leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
    safetyStockDays: DEFAULT_SAFETY_STOCK_DAYS,
  };
}
