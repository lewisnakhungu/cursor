export type CatalogMedicine = {
  id: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  levelOfUse: string | null;
  aliases?: string[];
  matchedBrand?: string | null;
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
};

export type ReceiveInventoryInput = {
  medicineId: string;
  batchNumber?: string;
  supplierName?: string;
  quantityOnHand: number;
  expiryDate: string;
  supplierCost?: number;
  retailSalePrice?: number;
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
};

export type SaleLineView = {
  id: string;
  saleId: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  batchNumber: string | null;
  quantity: number;
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

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
