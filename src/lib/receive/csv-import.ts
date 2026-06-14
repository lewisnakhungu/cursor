import type { ImportedLineItem } from "@/lib/types";

type CsvRow = Record<string, string | undefined>;

const NAME_KEYS = ["medicine", "name", "product", "item", "drug", "generic", "description"];
const QTY_KEYS = ["quantity", "qty", "qnty", "amount", "units"];
const BATCH_KEYS = ["batch", "batch number", "batchnumber", "lot", "lot number"];
const EXPIRY_KEYS = ["expiry", "expiry date", "expirydate", "exp", "exp date", "expiration"];
const COST_KEYS = ["cost", "supplier cost", "unitcost", "unit cost", "purchase price"];
const RETAIL_KEYS = ["retail", "price", "retail price", "sale price", "selling price"];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function pickField(row: CsvRow, keys: string[]): string | undefined {
  for (const [header, value] of Object.entries(row)) {
    const normalized = normalizeHeader(header);
    if (keys.includes(normalized) && value?.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const cleaned = value.replace(/[, ]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function parseQuantity(value: string | undefined): number {
  const n = parseNumber(value);
  if (n === undefined) return 0;
  return Math.max(0, Math.floor(n));
}

/** Normalise YYYY-MM-DD or DD/MM/YYYY style dates to ISO date string. */
function parseExpiry(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slash = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const day = Number.parseInt(slash[1], 10);
    const month = Number.parseInt(slash[2], 10);
    let year = Number.parseInt(slash[3], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return undefined;
}

/**
 * Maps Papa Parse row objects (header: true) into ImportedLineItem drafts.
 * Skips rows without a product name or with zero quantity.
 */
export function rowsToImportedLineItems(rows: CsvRow[]): ImportedLineItem[] {
  const items: ImportedLineItem[] = [];

  for (const row of rows) {
    const rawName = pickField(row, NAME_KEYS);
    if (!rawName) continue;

    const quantity = parseQuantity(pickField(row, QTY_KEYS));
    if (quantity <= 0) continue;

    items.push({
      rawName,
      quantity,
      batchNumber: pickField(row, BATCH_KEYS),
      expiryDate: parseExpiry(pickField(row, EXPIRY_KEYS)),
      supplierCost: parseNumber(pickField(row, COST_KEYS)),
      retailPrice: parseNumber(pickField(row, RETAIL_KEYS)),
      matchedMedicineId: null,
      matchConfidence: "NONE",
    });
  }

  return items;
}

export const CSV_TEMPLATE = `Medicine,Quantity,Batch,Expiry,Supplier Cost,Retail Price
Paracetamol 500mg Tablet,100,LOT-001,2027-06-30,2.50,5.00
Amoxicillin 250mg Capsule,50,B-4421,2026-12-01,8.00,15.00`;
