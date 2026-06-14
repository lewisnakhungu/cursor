import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ImportedLineItem } from "@/lib/types";

type RowRecord = Record<string, string | undefined>;

const NAME_KEYS = [
  "medicine",
  "name",
  "product",
  "item",
  "drug",
  "generic",
  "description",
];
const QTY_KEYS = ["quantity", "qty", "qnty", "amount", "units"];
const BATCH_KEYS = ["batch", "batch number", "batchnumber", "lot", "lot number"];
const EXPIRY_KEYS = [
  "expiry",
  "expiry date",
  "expirydate",
  "exp",
  "exp date",
  "expiration",
];
const COST_KEYS = ["cost", "supplier cost", "unitcost", "unit cost", "purchase price"];
const RETAIL_KEYS = ["retail", "price", "retail price", "sale price", "selling price"];

function emptyImportedFields(): Pick<
  ImportedLineItem,
  "matchedMedicineId" | "matchConfidence"
> {
  return {
    matchedMedicineId: null,
    matchConfidence: "NONE",
  };
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function pickField(row: RowRecord, keys: string[]): string | undefined {
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
export function parseExpiry(value: string | undefined): string | undefined {
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

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function rowToItem(row: RowRecord): ImportedLineItem | null {
  const rawName = pickField(row, NAME_KEYS);
  if (!rawName) return null;

  const quantity = parseQuantity(pickField(row, QTY_KEYS));
  if (quantity <= 0) return null;

  return {
    rawName,
    quantity,
    batchNumber: pickField(row, BATCH_KEYS),
    expiryDate: parseExpiry(pickField(row, EXPIRY_KEYS)),
    supplierCost: parseNumber(pickField(row, COST_KEYS)),
    retailPrice: parseNumber(pickField(row, RETAIL_KEYS)),
    ...emptyImportedFields(),
  };
}

/**
 * Maps structured row objects (CSV/Excel headers) into ImportedLineItem drafts.
 */
export function rowsToImportedLineItems(rows: RowRecord[]): ImportedLineItem[] {
  const items: ImportedLineItem[] = [];
  for (const row of rows) {
    const item = rowToItem(row);
    if (item) items.push(item);
  }
  return items;
}

export function parseCsvText(text: string): ImportedLineItem[] {
  const results = Papa.parse<RowRecord>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (results.errors.length > 0) {
    throw new Error(results.errors[0]?.message ?? "Failed to parse CSV");
  }

  return rowsToImportedLineItems(results.data);
}

export function parseExcelArrayBuffer(data: ArrayBuffer): ImportedLineItem[] {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  const rows: RowRecord[] = rawRows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, cellToString(value)]),
    ),
  );

  return rowsToImportedLineItems(rows);
}

function isStructuredPaste(text: string): boolean {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const normalized = firstLine.toLowerCase();
  return (
    normalized.includes("medicine") ||
    normalized.includes("product") ||
    normalized.includes("quantity") ||
    normalized.includes("qty")
  );
}

/**
 * Parses pasted spreadsheet text (CSV/TSV) or free-form printed delivery lines.
 */
export function parsePastedDeliveryText(text: string): ImportedLineItem[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.includes(",") || trimmed.includes("\t") || isStructuredPaste(trimmed)) {
    try {
      const structured = parseCsvText(trimmed);
      if (structured.length > 0) return structured;
    } catch {
      // Fall through to printed-line heuristics.
    }
  }

  return parsePrintedLineItems(trimmed);
}

function buildLineItem(rawName: string, quantity: number): ImportedLineItem {
  return {
    rawName,
    quantity,
    ...emptyImportedFields(),
  };
}

/**
 * Heuristic parser for OCR output or manually typed printed delivery lists.
 * Handles patterns like "Paracetamol 500mg 100", "100 x Amoxicillin", or tab columns.
 */
export function parsePrintedLineItems(text: string): ImportedLineItem[] {
  const items: ImportedLineItem[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.length < 3) continue;

    if (/^(medicine|product|item|drug|description|qty|quantity|#|no\.?\b)/i.test(line)) {
      continue;
    }

    const columns = line
      .split(/\t|,|;|\s{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (columns.length >= 2) {
      const trailingQty = parseQuantity(columns[columns.length - 1]);
      if (trailingQty > 0) {
        const name = columns.slice(0, -1).join(" ");
        if (name.length >= 2) {
          items.push(buildLineItem(name, trailingQty));
          continue;
        }
      }

      const secondColQty = parseQuantity(columns[1]);
      if (secondColQty > 0 && columns[0].length >= 2) {
        items.push(buildLineItem(columns[0], secondColQty));
        continue;
      }
    }

    const trailingMatch = line.match(/^(.+?\D)\s+(\d{1,6})\s*$/);
    if (trailingMatch) {
      const qty = Number.parseInt(trailingMatch[2], 10);
      const name = trailingMatch[1].trim();
      if (qty > 0 && name.length >= 2) {
        items.push(buildLineItem(name, qty));
        continue;
      }
    }

    const leadingMatch = line.match(/^(\d{1,6})\s*[x×]?\s+(.+)$/i);
    if (leadingMatch) {
      const qty = Number.parseInt(leadingMatch[1], 10);
      const name = leadingMatch[2].trim();
      if (qty > 0 && name.length >= 2) {
        items.push(buildLineItem(name, qty));
      }
    }
  }

  return items;
}

/** Runs OCR on a printed list photo (client-side). */
export async function scanPrintedListImage(file: File): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(file);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

export const CSV_TEMPLATE = `Medicine,Quantity,Batch,Expiry,Supplier Cost,Retail Price
Paracetamol 500mg Tablet,100,LOT-001,2027-06-30,2.50,5.00
Amoxicillin 250mg Capsule,50,B-4421,2026-12-01,8.00,15.00`;

export function buildExcelTemplateBlob(): Blob {
  const rows = [
    ["Medicine", "Quantity", "Batch", "Expiry", "Supplier Cost", "Retail Price"],
    ["Paracetamol 500mg Tablet", 100, "LOT-001", "2027-06-30", 2.5, 5],
    ["Amoxicillin 250mg Capsule", 50, "B-4421", "2026-12-01", 8, 15],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Delivery");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
