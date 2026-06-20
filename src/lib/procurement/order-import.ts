import * as XLSX from "xlsx";

/** Partner order list template — medicine name + quantity only. */
export const PROCUREMENT_CSV_TEMPLATE = `Medicine,Quantity
Paracetamol 500mg Tablet,100
Amoxicillin 250mg Capsule,50
Metformin 500mg Tablet,200`;

export function buildProcurementExcelTemplateBlob(): Blob {
  const rows = [
    ["Medicine", "Quantity"],
    ["Paracetamol 500mg Tablet", 100],
    ["Amoxicillin 250mg Capsule", 50],
    ["Metformin 500mg Tablet", 200],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Order");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadProcurementCsvTemplate(): void {
  const blob = new Blob([PROCUREMENT_CSV_TEMPLATE], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "afyastock-procurement-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadProcurementExcelTemplate(): void {
  const blob = buildProcurementExcelTemplateBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "afyastock-procurement-template.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
}
