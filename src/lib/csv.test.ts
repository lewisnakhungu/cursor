import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "@/lib/csv";

describe("csvEscape", () => {
  it("passes plain values through", () => {
    expect(csvEscape("Paracetamol")).toBe("Paracetamol");
    expect(csvEscape(42)).toBe("42");
  });

  it("renders null/undefined as empty", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes spreadsheet formula injection", () => {
    expect(csvEscape("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvEscape("+254700000000")).toBe("'+254700000000");
    expect(csvEscape("@cmd")).toBe("'@cmd");
  });
});

describe("toCsv", () => {
  it("builds CRLF-joined rows with a UTF-8 BOM", () => {
    const csv = toCsv(
      ["name", "qty"],
      [
        ["Amoxicillin", 10],
        ["Ibuprofen, coated", 5],
      ],
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("name,qty\r\n");
    expect(csv).toContain('"Ibuprofen, coated",5');
  });
});
