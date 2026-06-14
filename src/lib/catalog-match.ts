/**
 * Shared catalog text normalization and fuzzy matching for bulk import,
 * catalog search scoring, and hybrid catalog seeding.
 */

export type CatalogMatchMedicine = {
  genericName: string;
  dosageForm: string;
  strength: string;
  searchKey: string;
  aliases: Array<{ name: string }>;
};

const LIQUID_FORM =
  /\b(syrups?|suspensions?|susp|oral liquids?|oral solutions?|elixirs?|mixtures?)\b/gi;
const TABLET_FORM = /\b(tablets?|tabs?|capsules?|caps?)\b/gi;
const INJECTION_FORM =
  /\b(injections?|inj|injectable|ampoules?|amps?|vials?|infusions?)\b/gi;
const TOPICAL_FORM =
  /\b(ointments?|creams?|gels?|lotions?|rubs?|balms?|topicals?|drops?)\b/gi;
const CONSUMABLE_HINT =
  /\b(syringes?|needles?|cannulas?|gloves?|gauzes?|plasters?|bandages?|envelopes?|tourniquets?|cotton|mrdr?t|test kits?|giving sets?|dispensing)\b/i;

const WEAK_TOKENS = new Set([
  "co",
  "the",
  "and",
  "for",
  "with",
  "mg",
  "ml",
  "liquid",
  "tablet",
  "oral",
  "drops",
  "needles",
  "needle",
  "syringe",
  "syringes",
  "refill",
  "pack",
  "tabs",
  "per",
  "lot",
  "cc",
  "ui",
]);

/** Generic-name tokens too common to use as a sole match signal. */
const WEAK_GENERIC_TOKENS = new Set([
  ...Array.from(WEAK_TOKENS),
  "paraffin",
  "sodium",
  "acid",
  "chloride",
  "sulfate",
  "hydrochloride",
  "injection",
  "solution",
  "suspension",
  "cream",
  "ointment",
]);

type FormClass =
  | "liquid"
  | "tablet"
  | "injection"
  | "topical"
  | "consumable"
  | "other";

export function compactUnits(value: string): string {
  return value
    .replace(/(\d)\s*(mg|ml|g|mcg|%)/gi, "$1$2")
    .replace(/\b5\s*ml\b/gi, "5ml")
    .replace(/\b5m\s*l\b/gi, "5ml");
}

export function normalizeFormTerms(value: string): string {
  return value
    .replace(LIQUID_FORM, " liquid ")
    .replace(TABLET_FORM, " tablet ")
    .replace(INJECTION_FORM, " injection ")
    .replace(TOPICAL_FORM, " topical ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCatalogText(value: string): string {
  return compactUnits(
    normalizeFormTerms(
      value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\[[a-z]\]/gi, " ")
        .replace(/[^a-z0-9+%/]+/g, " ")
        .trim(),
    ),
  ).replace(/\s+/g, " ");
}

/** Legacy alias used by catalog search input normalization. */
export function normalizeQuery(query: string): string {
  return normalizeCatalogText(query);
}

export function extractQueryVariants(rawName: string): string[] {
  const variants = new Set<string>();
  const trimmed = rawName.trim();
  if (!trimmed) return [];

  variants.add(normalizeCatalogText(trimmed));

  const parenMatches = trimmed.match(/\(([^)]+)\)/g) ?? [];
  if (parenMatches.length > 0) {
    variants.add(normalizeCatalogText(trimmed.replace(/\([^)]+\)/g, " ")));
    for (const group of parenMatches) {
      variants.add(normalizeCatalogText(group.slice(1, -1)));
    }
  }

  return Array.from(variants).filter((v) => v.length >= 2);
}

export function buildMedicineSearchSurface(
  medicine: CatalogMatchMedicine,
): string {
  const parts = [
    medicine.genericName,
    medicine.dosageForm,
    medicine.strength,
    ...medicine.aliases.map((a) => a.name),
  ];
  return normalizeCatalogText(parts.join(" "));
}

function detectFormClasses(text: string): Set<FormClass> {
  const norm = normalizeCatalogText(text);
  const classes = new Set<FormClass>();

  if (CONSUMABLE_HINT.test(norm)) classes.add("consumable");
  if (/\binjection\b/.test(norm)) classes.add("injection");
  if (/\btopical\b/.test(norm)) classes.add("topical");
  if (/\bliquid\b/.test(norm)) classes.add("liquid");
  if (/\btablet\b/.test(norm)) classes.add("tablet");

  if (classes.size === 0) classes.add("other");
  return classes;
}

function primaryPharmForm(forms: Set<FormClass>): FormClass | null {
  for (const form of ["tablet", "liquid", "injection", "topical"] as const) {
    if (forms.has(form)) return form;
  }
  return null;
}

function formsConflict(query: string, medicine: CatalogMatchMedicine): boolean {
  const queryForms = detectFormClasses(query);
  const medForms = detectFormClasses(
    [medicine.genericName, medicine.dosageForm, medicine.strength].join(" "),
  );

  if (queryForms.has("consumable") && !medForms.has("consumable")) {
    return true;
  }
  if (medForms.has("consumable") && !queryForms.has("consumable")) {
    return true;
  }

  const queryForm = primaryPharmForm(queryForms);
  const medForm = primaryPharmForm(medForms);
  if (queryForm && medForm && queryForm !== medForm) {
    return true;
  }

  return false;
}

function extractStrengthTokens(text: string): string[] {
  const matches =
    text.match(/\d+(?:\.\d+)?(?:mg|ml|mcg|g|%)(?:\/\d+(?:\.\d+)?(?:mg|ml))?/gi) ??
    [];
  return Array.from(new Set(matches.map((m) => compactUnits(m.toLowerCase()))));
}

function primaryMgValue(text: string): string | null {
  const strengths = extractStrengthTokens(text);
  for (const token of strengths) {
    const match = token.match(/^(\d+(?:\.\d+)?)mg/i);
    if (match) return `${match[1]}mg`;
  }
  return null;
}

function strengthsConflict(query: string, medicine: CatalogMatchMedicine): boolean {
  const queryMg = primaryMgValue(query);
  const medMg = primaryMgValue(
    [medicine.strength, medicine.genericName, medicine.dosageForm].join(" "),
  );
  if (!queryMg || !medMg) return false;
  return queryMg !== medMg;
}

function genericMatchScore(
  query: string,
  medicine: CatalogMatchMedicine,
): number {
  const generic = normalizeCatalogText(medicine.genericName);
  if (!generic) return 0;

  if (query === generic) return 100;
  if (generic.length >= 5 && query.includes(generic)) return 95;

  const genericTokens = generic.split(" ").filter((t) => t.length >= 4);
  const lead = genericTokens.slice(0, 2).join(" ");
  if (lead.length >= 8 && query.includes(lead)) return 90;

  const primary = genericTokens[0];
  if (
    primary &&
    primary.length >= 5 &&
    !WEAK_GENERIC_TOKENS.has(primary) &&
    new RegExp(`\\b${primary}\\b`).test(query)
  ) {
    return 85;
  }

  return 0;
}

function aliasMatchScore(
  query: string,
  medicine: CatalogMatchMedicine,
): number {
  let best = 0;

  for (const alias of medicine.aliases) {
    const aliasNorm = normalizeCatalogText(alias.name);
    if (!aliasNorm || aliasNorm.length < 6) continue;

    if (aliasNorm === query) {
      best = Math.max(best, 100);
      continue;
    }

    if (query.includes(aliasNorm) || aliasNorm.includes(query)) {
      const genericScore = genericMatchScore(query, medicine);
      if (genericScore >= 85 || aliasNorm.length >= 12) {
        best = Math.max(best, 98);
      } else if (genericScore >= 0 && !formsConflict(query, medicine)) {
        best = Math.max(best, 88);
      }
    }
  }

  return best;
}

function tokenOverlapScore(query: string, surface: string): number {
  const tokens = query
    .split(" ")
    .filter((token) => {
      if (WEAK_TOKENS.has(token)) return false;
      if (token.length >= 3) return true;
      return /\d/.test(token);
    });

  if (tokens.length === 0) return 0;

  const matched = tokens.filter((token) => surface.includes(token));
  if (matched.length === tokens.length) {
    return tokens.length >= 4 ? 70 : 55;
  }

  if (matched.length >= Math.max(3, Math.ceil(tokens.length * 0.8))) {
    return 45;
  }

  return 0;
}

function consumableMatchScore(
  query: string,
  medicine: CatalogMatchMedicine,
): number {
  if (!CONSUMABLE_HINT.test(query)) return 0;

  const surface = buildMedicineSearchSurface(medicine);
  const medIsConsumable =
    detectFormClasses(surface).has("consumable") ||
    CONSUMABLE_HINT.test(surface);
  if (!medIsConsumable) return 0;

  const hints = [
    "syringes",
    "syringe",
    "needles",
    "needle",
    "cannulas",
    "cannula",
    "gloves",
    "glove",
    "gauze",
    "plaster",
    "bandage",
    "mrdt",
    "tourniquet",
    "cotton",
  ];
  for (const hint of hints) {
    if (query.includes(hint) && surface.includes(hint)) return 98;
  }

  return 0;
}

function scoreQueryAgainstMedicine(
  query: string,
  medicine: CatalogMatchMedicine,
  rawQuery?: string,
): number {
  if (!query || query.length < 2) return 0;

  const consumableScore = consumableMatchScore(
    rawQuery ?? query,
    medicine,
  );
  if (consumableScore > 0) return consumableScore;

  if (formsConflict(rawQuery ?? query, medicine)) return 0;
  if (strengthsConflict(rawQuery ?? query, medicine)) return 0;

  const surface = buildMedicineSearchSurface(medicine);

  const aliasScore = aliasMatchScore(query, medicine);
  const genericScore = genericMatchScore(query, medicine);

  if (aliasScore >= 98) return aliasScore;
  if (genericScore >= 95) return genericScore;

  if (genericScore >= 85) {
    if (aliasScore > 0) return Math.max(aliasScore, genericScore);
    const overlap = tokenOverlapScore(query, surface);
    return Math.max(genericScore, overlap > 0 ? Math.min(genericScore, overlap + 10) : 0);
  }

  if (aliasScore >= 88) return aliasScore;

  if (genericScore === 0) return 0;

  const overlap = tokenOverlapScore(query, surface);
  return Math.min(genericScore, overlap);
}

export function scoreCatalogMatch(
  rawName: string,
  medicine: CatalogMatchMedicine,
): number {
  const rawQuery = normalizeCatalogText(rawName);
  if (formsConflict(rawQuery, medicine)) return 0;
  if (strengthsConflict(rawQuery, medicine)) return 0;

  const queries = extractQueryVariants(rawName);
  let best = 0;

  for (const query of queries) {
    best = Math.max(best, scoreQueryAgainstMedicine(query, medicine, rawQuery));
  }

  return best;
}

/** Used by hybrid seed only when base_name clearly shares a multi-word generic lead. */
export function genericPrefixMatch(
  baseName: string,
  genericName: string,
): boolean {
  const baseNorm = normalizeCatalogText(baseName);
  const genericNorm = normalizeCatalogText(genericName);
  if (!baseNorm || !genericNorm) return false;

  const baseLead = baseNorm.split(" ").slice(0, 2).join(" ");
  if (baseLead.length >= 8 && genericNorm.startsWith(baseLead)) return true;

  return false;
}

/** Minimum score treated as LOW confidence in bulk import. */
export const BULK_MATCH_LOW_THRESHOLD = 45;

/** Minimum score treated as HIGH confidence in bulk import. */
export const BULK_MATCH_HIGH_THRESHOLD = 90;

export function confidenceFromMatchScore(score: number): "HIGH" | "LOW" | "NONE" {
  if (score >= BULK_MATCH_HIGH_THRESHOLD) return "HIGH";
  if (score >= BULK_MATCH_LOW_THRESHOLD) return "LOW";
  return "NONE";
}
