import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  parseExcelArrayBuffer,
  parsePastedDeliveryText,
  parsePrintedLineItems,
  rowsToImportedLineItems,
} from "@/lib/receive/delivery-import";

describe("parsePrintedLineItems", () => {
  it("parses trailing quantity lines", () => {
    const items = parsePrintedLineItems(
      "Paracetamol 500mg tabs 100\nAmoxicillin 250 caps 50",
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      rawName: "Paracetamol 500mg tabs",
      quantity: 100,
    });
    expect(items[1]).toMatchObject({
      rawName: "Amoxicillin 250 caps",
      quantity: 50,
    });
  });

  it("parses leading quantity lines", () => {
    const items = parsePrintedLineItems("100 x Paracetamol\n50 Metformin");
    expect(items[0]?.quantity).toBe(100);
    expect(items[1]?.quantity).toBe(50);
  });

  it("skips header rows", () => {
    const items = parsePrintedLineItems("Medicine Qty\nParacetamol 20");
    expect(items).toHaveLength(1);
    expect(items[0]?.rawName).toBe("Paracetamol");
  });
});

describe("parsePastedDeliveryText", () => {
  it("parses structured CSV paste", () => {
    const items = parsePastedDeliveryText(
      "Medicine,Quantity\nParacetamol 500mg,24\n",
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(24);
  });
});

describe("parseExcelArrayBuffer", () => {
  it("reads the first worksheet with headers", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Medicine", "Quantity"],
      ["Paracetamol 500mg Tablet", 12],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
    const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" });

    const items = parseExcelArrayBuffer(buffer);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      rawName: "Paracetamol 500mg Tablet",
      quantity: 12,
    });
  });
});

describe("rowsToImportedLineItems", () => {
  it("maps flexible column names", () => {
    const items = rowsToImportedLineItems([
      { Product: "Ibuprofen 400mg", Qty: "30" },
    ]);
    expect(items[0]?.rawName).toBe("Ibuprofen 400mg");
    expect(items[0]?.quantity).toBe(30);
  });
});
