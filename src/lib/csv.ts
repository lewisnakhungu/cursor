/**
 * CSV export helpers (audit PM-M4). Client-side generation from report
 * data already loaded — no extra server round trip.
 */
import type { SalesReportData, StockReportData } from "@/lib/types";
import { itemTypeLabel } from "@/lib/report-item-type";

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Guard against spreadsheet formula injection (=, +, -, @ prefixes).
  const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s;
  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map(csvEscape).join(","),
  );
  // BOM so Excel detects UTF-8.
  return `\uFEFF${lines.join("\r\n")}`;
}

export function stockReportCsv(data: StockReportData): string {
  return toCsv(
    [
      "Generic name",
      "Dosage form",
      "Strength",
      "Item type",
      "Batch number",
      "Supplier",
      "Quantity on hand",
      "Unit",
      "Units per pack",
      "Expiry date",
      "Days until expiry",
      "Retail price (KES)",
      "Stock value (KES)",
      "Flags",
    ],
    data.rows.map((row) => [
      row.genericName,
      row.dosageForm,
      row.strength,
      itemTypeLabel(row.itemType),
      row.batchNumber,
      row.supplierName,
      row.quantityOnHand,
      row.stockUnit,
      row.unitsPerPack,
      row.expiryDate,
      row.daysUntilExpiry,
      row.retailSalePrice,
      row.stockValue,
      row.flags.join("; "),
    ]),
  );
}

export function salesReportCsv(data: SalesReportData): string {
  return toCsv(
    [
      "Sale ID",
      "Sold at",
      "Generic name",
      "Dosage form",
      "Strength",
      "Item type",
      "Batch number",
      "Quantity",
      "Unit",
      "Unit price (KES)",
      "Line total (KES)",
      "Status",
    ],
    data.lineDetails.map((line) => [
      line.saleId,
      line.saleAt,
      line.genericName,
      line.dosageForm,
      line.strength,
      itemTypeLabel(line.itemType),
      line.batchNumber,
      line.quantity,
      line.stockUnit,
      line.unitPrice,
      line.lineTotal,
      line.status,
    ]),
  );
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
