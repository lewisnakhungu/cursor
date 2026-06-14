/**
 * Download and parse KEMSA's public PRODUCT LIST.pdf into structured JSON.
 *
 *   npm run scrape:kemsa
 *
 * Source: https://kemsa.go.ke/content/137/publications/kemsa-product-catalogue
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isNonPharmPrefix,
  parseKemsaCatalogText,
} from "../src/lib/kemsa-catalog";

const KEMSA_PDF_URL =
  "https://kemsa.go.ke/download/file/86a6023fa3ce0e75c55a3cc6e6b83ea4.pdf";

const LOCAL_PDF_CANDIDATES = [
  resolve(__dirname, "../data/kemsa/PRODUCT_LIST.pdf"),
  resolve(__dirname, "../../KEMSA -PRODUCT LIST.pdf"),
];
const DATA_DIR = resolve(__dirname, "../data/kemsa");
const PDF_PATH = resolve(DATA_DIR, "PRODUCT_LIST.pdf");
const JSON_PATH = resolve(DATA_DIR, "kemsa_product_list.json");

function resolveSourcePdf(): string {
  for (const candidate of LOCAL_PDF_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return PDF_PATH;
}

function getPdfTextWithPdftotext(pdfPath: string): string {
  return execSync(`pdftotext "${pdfPath}" -`, {
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function getPdfText(pdfPath: string): Promise<string> {
  if (existsSync("/usr/bin/pdftotext")) {
    return getPdfTextWithPdftotext(pdfPath);
  }
  const pdfParseModule = await import("pdf-parse");
  const pdfParse =
    "default" in pdfParseModule
      ? (pdfParseModule.default as (
          buffer: Buffer,
        ) => Promise<{ text: string }>)
      : (pdfParseModule as unknown as (
          buffer: Buffer,
        ) => Promise<{ text: string }>);
  const result = await pdfParse(readFileSync(pdfPath));
  return result.text;
}

async function downloadPdf(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download KEMSA PDF: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(dest, buffer);
}

async function main(): Promise<void> {
  const skipDownload = process.argv.includes("--skip-download");

  mkdirSync(DATA_DIR, { recursive: true });

  const sourcePdf = resolveSourcePdf();
  if (!skipDownload && sourcePdf === PDF_PATH && !existsSync(PDF_PATH)) {
    console.log(`Downloading KEMSA product list…`);
    await downloadPdf(KEMSA_PDF_URL, PDF_PATH);
  } else if (sourcePdf !== PDF_PATH) {
    console.log(`Using local PDF: ${sourcePdf}`);
    writeFileSync(PDF_PATH, readFileSync(sourcePdf));
  } else {
    console.log(`Using cached PDF at ${PDF_PATH}`);
  }

  const text = await getPdfText(PDF_PATH);
  const products = parseKemsaCatalogText(text);

  const payload = {
    scrapedAt: new Date().toISOString(),
    sourceUrl: sourcePdf,
    sourceFile: sourcePdf,
    productCount: products.length,
    products,
  };

  writeFileSync(JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`);

  const pharm = products.filter((p) => p.codePrefix === "PM").length;
  const nonPharm = products.filter((p) => isNonPharmPrefix(p.codePrefix)).length;

  console.log(
    JSON.stringify(
      {
        pdfPath: PDF_PATH,
        jsonPath: JSON_PATH,
        totalProducts: products.length,
        pharmaceutical: pharm,
        nonPharmaceutical: nonPharm,
        other: products.length - pharm - nonPharm,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
