export type KemsaProduct = {
  productCode: string;
  productName: string;
  packSize: string;
  category: string;
  /** PM = pharmaceutical, NM/NL/etc = non-pharm or other HPT */
  codePrefix: string;
};

const PRODUCT_CODE_RE = /^[A-Z]{2}\d{2}[A-Z]{3}\d{3}$/;

const CATEGORY_HEADERS = new Set([
  "HEALTH PRODUCTS AND TECHNOLOGIES",
  "PRODUCT CODE",
  "PRODUCT NAME",
  "PACK SIZE",
  "PHARMACEUTICAL PRODUCTS",
  "ONCOLOGY PRODUCTS",
  "RENAL PRODUCTS",
  "NON-PHARMACEUTICAL ITEMS",
  "LABORATORY PRODUCTS",
  "LINEN",
  "DENTAL PRODUCTS",
  "BASIC EQUIPMENT AND CONSUMABLES",
  "ORTHOPAEDIC PRODUCTS",
  "PUBLIC HEALTH PRODUCTS",
  "X-RAY PRODUCTS",
]);

const NON_PHARM_PREFIXES = new Set([
  "NM",
  "NL",
  "NU",
  "EM",
  "NE",
  "NG",
  "NX",
  "EG",
  "KA",
  "NS",
  "NP",
]);

function isCategoryHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (CATEGORY_HEADERS.has(trimmed)) return true;
  if (
    trimmed === trimmed.toUpperCase() &&
    /PRODUCTS|ITEMS|CONSUMABLES|LINEN/.test(trimmed)
  ) {
    return true;
  }
  return false;
}

function looksLikePackSize(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return false;
  if (PRODUCT_CODE_RE.test(trimmed)) return false;
  if (isCategoryHeader(trimmed)) return false;

  return (
    /^(pack|tin|blister|box|roll|set|carton|bottle|vial|ampoule|syringe|each|pair|tube|bag|sachet|strip|container|unit|dozen|kit|canister|drum|pallet|carton)/i.test(
      trimmed,
    ) ||
    /\bof\s+\d/i.test(trimmed) ||
    /^\d+\s*(s|pcs|pieces|units|ml|mg|g|kg|cm|mm|m)\b/i.test(trimmed)
  );
}

function drugFamilyCode(productCode: string): string {
  // PM03AMX015 → AMX
  return productCode.length >= 7 ? productCode.slice(4, 7) : "";
}

export function parseKemsaCatalogText(text: string): KemsaProduct[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const products: KemsaProduct[] = [];
  let category = "PHARMACEUTICAL PRODUCTS";
  let pendingCode: string | null = null;
  let pendingName: string | null = null;
  let lastNamed: { code: string; name: string } | null = null;

  function inheritName(code: string): string | null {
    if (!lastNamed) return null;
    if (drugFamilyCode(code) && drugFamilyCode(code) === drugFamilyCode(lastNamed.code)) {
      return lastNamed.name;
    }
    return null;
  }

  function flushPending(packSize = ""): void {
    if (!pendingCode) return;
    const name = pendingName?.trim() || inheritName(pendingCode) || "";
    if (!name) {
      pendingCode = null;
      pendingName = null;
      return;
    }
    products.push({
      productCode: pendingCode,
      productName: name,
      packSize,
      category,
      codePrefix: pendingCode.slice(0, 2),
    });
    lastNamed = { code: pendingCode, name };
    pendingCode = null;
    pendingName = null;
  }

  for (const line of lines) {
    if (isCategoryHeader(line)) {
      category = line;
      continue;
    }

    if (PRODUCT_CODE_RE.test(line)) {
      flushPending();
      pendingCode = line;
      pendingName = null;
      continue;
    }

    if (looksLikePackSize(line)) {
      if (pendingCode) {
        flushPending(line);
      }
      continue;
    }

    if (pendingCode) {
      pendingName = pendingName ? `${pendingName} ${line}` : line;
    }
  }

  flushPending();
  return products;
}

export function isNonPharmPrefix(prefix: string): boolean {
  return NON_PHARM_PREFIXES.has(prefix);
}

export function isLikelyNonPharm(product: KemsaProduct): boolean {
  if (isNonPharmPrefix(product.codePrefix)) return true;
  return /NON-PHARM|LABORATORY|LINEN|DENTAL|ORTHOPAEDIC|BASIC EQUIPMENT/i.test(
    product.category,
  );
}

export function isUsableKemsaProductName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 4) return false;
  if (/^(piece|pack|tube|each)$/i.test(trimmed)) return false;
  if (/^(piece\s+){2,}/i.test(trimmed)) return false;
  return true;
}

export function kemsaCategoryLabel(category: string): string {
  return category
    .replace(/\s+PRODUCTS$/i, "")
    .replace(/\s+ITEMS$/i, "")
    .trim();
}
