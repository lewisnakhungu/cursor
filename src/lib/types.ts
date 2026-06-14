import type { StockUnitCode } from "@/lib/stock-unit";

export type CatalogStockAvailability = {
  hasStock: boolean;
  totalOnHand: number;
  batchCount: number;
  /** Human-readable, e.g. "240 tablets" or "10 boxes + 50 tablets" */
  summary: string;
  mixedUnits: boolean;
};

export type CatalogItemType = "MEDICINE" | "NON_PHARM";

export type CatalogMedicine = {
  id: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  levelOfUse: string | null;
  itemType: CatalogItemType;
  category: string | null;
  aliases?: string[];
  matchedBrand?: string | null;
  stock?: CatalogStockAvailability;
};

export type StockBatchView = {
  id: string;
  medicineId: string;
  batchNumber: string | null;
  quantityOnHand: number;
  expiryDate: string;
  receivedAt: string;
  supplierCost: string | null;
  retailSalePrice: string | null;
  supplierName: string | null;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
};

export type ReceiveInventoryInput = {
  medicineId: string;
  batchNumber?: string;
  supplierName?: string;
  quantityOnHand: number;
  expiryDate: string;
  supplierCost?: number;
  retailSalePrice?: number;
  stockUnit: StockUnitCode;
  unitsPerPack?: number;
};

/** Confidence assigned when matching a CSV product name to KEML. */
export type MatchConfidence = "HIGH" | "LOW" | "NONE";

/** One parsed row from a bulk delivery spreadsheet before user review. */
export type ImportedLineItem = {
  rawName: string;
  quantity: number;
  batchNumber?: string;
  expiryDate?: string;
  supplierCost?: number;
  retailPrice?: number;
  matchedMedicineId: string | null;
  matchConfidence: MatchConfidence;
};

/** Server-validated row ready for bulk stock batch insertion. */
export type ValidatedInventoryItem = ReceiveInventoryInput;

/** Supplier label → catalog row, learned from a successful bulk receive. */
export type CatalogAliasLearning = {
  rawName: string;
  medicineId: string;
  autoMatchedHigh?: boolean;
};

export type BulkReceiveInput = {
  items: ValidatedInventoryItem[];
  aliasLearnings?: CatalogAliasLearning[];
};

/** Result of matching a single raw CSV name against the formulary. */
export type BulkCatalogMatch = {
  rawName: string;
  medicineId: string | null;
  matchConfidence: MatchConfidence;
  medicine: CatalogMedicine | null;
};

export type BulkReceiveResult = {
  count: number;
  aliasesLearned?: number;
};

export type CartDispenseItem = {
  medicineId: string;
  quantity: number;
  stockBatchId?: string;
};

export type SaleReceiptLine = {
  id: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  batchNumber: string | null;
  quantity: number;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
  unitPrice: number;
  lineTotal: number;
  status: "ACTIVE" | "VOIDED";
};

export type DispenseResult = {
  saleId: string;
  createdAt: string;
  lineCount: number;
  totalAmount: number;
  lines: SaleReceiptLine[];
};

export type StockBatchRow = {
  id: string;
  medicineId: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  batchNumber: string | null;
  quantityOnHand: number;
  expiryDate: string;
  daysUntilExpiry: number;
  isLowStock: boolean;
  isExpiringSoon: boolean;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
  retailSalePrice: number | null;
};

export type ExpiringStockReport = {
  hasExpiryWarning: boolean;
  expiringWithin90Days: StockBatchRow[];
  activeBatches: StockBatchRow[];
  lowStockCount: number;
};

export type TodaySalesMetrics = {
  saleCount: number;
  lineCount: number;
  unitsSold: number;
  grossRevenue: number;
  voidedLines: number;
  byItemType: RevenueByItemType;
};

export type RevenueByItemType = {
  medicineRevenue: number;
  nonPharmRevenue: number;
  medicineUnitsSold: number;
  nonPharmUnitsSold: number;
};

export type SaleLineView = {
  id: string;
  saleId: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  itemType: CatalogItemType;
  batchNumber: string | null;
  quantity: number;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
  unitPrice: number;
  lineTotal: number;
  status: "ACTIVE" | "VOIDED";
  correctionNote: string | null;
  createdAt: string;
};

export type SaleSummary = {
  id: string;
  createdAt: string;
  totalAmount: number;
  activeLineCount: number;
  lines: SaleLineView[];
};

export type TopSellingDrug = {
  medicineId: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  itemType: CatalogItemType;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
  unitsSold: number;
  revenue: number;
  dispenseCount: number;
};

export type SalesDashboardData = {
  today: TodaySalesMetrics;
  todaySales: SaleSummary[];
  topDrugs7Days: TopSellingDrug[];
  topDrugsToday: TopSellingDrug[];
};

export type CorrectSaleLineInput = {
  saleLineId: string;
  newQuantity: number;
  reason: string;
};

export type InsightsPeriodDays = 7 | 30 | 90 | 365;

export type ReceiveHistoryRow = {
  batchId: string;
  receivedAt: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  batchNumber: string | null;
  supplierName: string | null;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
  quantityReceived: number;
  quantityOnHand: number;
  quantitySold: number;
  sellThroughPercent: number;
  supplierCost: number | null;
  retailSalePrice: number | null;
  receiveCostTotal: number | null;
  revenueFromBatch: number;
  costOfGoodsSold: number | null;
  grossMargin: number | null;
};

export type WeeklyStockingBucket = {
  weekStart: string;
  label: string;
  receiveCount: number;
  unitsReceived: number;
  receiveCost: number;
  unitsSold: number;
  revenue: number;
};

export type StockingInsightsSummary = {
  receiveEvents: number;
  unitsReceived: number;
  receiveCostValue: number;
  unitsSold: number;
  revenue: number;
  grossMargin: number | null;
  sellThroughPercent: number;
  distinctMedicines: number;
};

export type TopRestockedItem = {
  genericName: string;
  stockUnit: StockUnitCode;
  receiveCount: number;
  unitsReceived: number;
  unitsSold: number;
};

export type StockingInsightsData = {
  periodDays: InsightsPeriodDays;
  periodLabel: string;
  summary: StockingInsightsSummary;
  weeklyTrend: WeeklyStockingBucket[];
  receiveHistory: ReceiveHistoryRow[];
  topRestocked: TopRestockedItem[];
  slowMovers: ReceiveHistoryRow[];
};

export type ReportPeriodDays = 7 | 30;

export type SalesByDayRow = {
  date: string;
  label: string;
  saleCount: number;
  unitsSold: number;
  revenue: number;
  medicineRevenue: number;
  nonPharmRevenue: number;
};

export type SalesReportLineDetail = {
  saleId: string;
  saleAt: string;
  lineId: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  itemType: CatalogItemType;
  batchNumber: string | null;
  quantity: number;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
  unitPrice: number;
  lineTotal: number;
  status: "ACTIVE" | "VOIDED";
};

export type SalesReportData = {
  reportTitle: string;
  periodDays: ReportPeriodDays;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  facilityName: string;
  sales: {
    saleCount: number;
    unitsSold: number;
    grossRevenue: number;
    voidedLines: number;
    averageSaleValue: number;
    byItemType: RevenueByItemType;
  };
  salesByDay: SalesByDayRow[];
  topDrugs: TopSellingDrug[];
  lineDetails: SalesReportLineDetail[];
  stocking: StockingInsightsSummary | null;
  weeklyRestockTrend: WeeklyStockingBucket[];
  topRestocked: TopRestockedItem[];
};

export type StockReportRow = {
  genericName: string;
  dosageForm: string;
  strength: string;
  itemType: CatalogItemType;
  batchNumber: string | null;
  supplierName: string | null;
  quantityOnHand: number;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
  expiryDate: string;
  daysUntilExpiry: number;
  retailSalePrice: number | null;
  stockValue: number | null;
  flags: string[];
};

export type StockReportData = {
  reportTitle: string;
  generatedAt: string;
  facilityName: string;
  totalBatches: number;
  totalUnits: number;
  estimatedRetailValue: number;
  expiringWithin90Count: number;
  lowStockCount: number;
  byItemType: {
    medicineBatches: number;
    nonPharmBatches: number;
    medicineUnits: number;
    nonPharmUnits: number;
    medicineRetailValue: number;
    nonPharmRetailValue: number;
  };
  rows: StockReportRow[];
};

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
