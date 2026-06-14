"""
Python mirror of src/lib/catalog-match.ts for offline catalog verification.
Keep in sync when matching rules change.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Iterable

BULK_MATCH_LOW_THRESHOLD = 45
BULK_MATCH_HIGH_THRESHOLD = 90

LIQUID_FORM = re.compile(
    r"\b(syrups?|suspensions?|susp|oral liquids?|oral solutions?|elixirs?|mixtures?)\b",
    re.I,
)
TABLET_FORM = re.compile(r"\b(tablets?|tabs?|capsules?|caps?)\b", re.I)
INJECTION_FORM = re.compile(
    r"\b(injections?|inj|injectable|ampoules?|amps?|vials?|infusions?)\b",
    re.I,
)
TOPICAL_FORM = re.compile(
    r"\b(ointments?|creams?|gels?|lotions?|rubs?|balms?|topicals?|drops?)\b",
    re.I,
)
CONSUMABLE_HINT = re.compile(
    r"\b(syringes?|needles?|cannulas?|gloves?|gauzes?|plasters?|bandages?"
    r"|envelopes?|tourniquets?|cotton|mrdr?t|test kits?|giving sets?|dispensing)\b",
    re.I,
)

WEAK_TOKENS = {
    "co", "the", "and", "for", "with", "mg", "ml", "liquid", "tablet", "oral",
    "drops", "needles", "needle", "syringe", "syringes", "refill", "pack",
    "tabs", "per", "lot", "cc", "ui",
}

WEAK_GENERIC_TOKENS = WEAK_TOKENS | {
    "paraffin", "sodium", "acid", "chloride", "sulfate", "hydrochloride",
    "injection", "solution", "suspension", "cream", "ointment",
}


@dataclass
class Medicine:
    generic_name: str
    dosage_form: str = ""
    strength: str = ""
    search_key: str = ""
    aliases: list[dict[str, str]] = field(default_factory=list)


def compact_units(value: str) -> str:
    value = re.sub(r"(\d)\s*(mg|ml|g|mcg|%)", r"\1\2", value, flags=re.I)
    value = re.sub(r"\b5\s*ml\b", "5ml", value, flags=re.I)
    return re.sub(r"\b5m\s*l\b", "5ml", value, flags=re.I)


def normalize_form_terms(value: str) -> str:
    value = LIQUID_FORM.sub(" liquid ", value)
    value = TABLET_FORM.sub(" tablet ", value)
    value = INJECTION_FORM.sub(" injection ", value)
    value = TOPICAL_FORM.sub(" topical ", value)
    return re.sub(r"\s+", " ", value).strip()


def normalize_catalog_text(value: str) -> str:
    value = value.lower()
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = re.sub(r"\[[a-z]\]", " ", value, flags=re.I)
    value = re.sub(r"[^a-z0-9+%/]+", " ", value)
    value = compact_units(normalize_form_terms(value.strip()))
    return re.sub(r"\s+", " ", value).strip()


def extract_query_variants(raw_name: str) -> list[str]:
    trimmed = raw_name.strip()
    if not trimmed:
        return []
    variants: set[str] = {normalize_catalog_text(trimmed)}
    paren_matches = re.findall(r"\(([^)]+)\)", trimmed)
    if paren_matches:
        variants.add(normalize_catalog_text(re.sub(r"\([^)]+\)", " ", trimmed)))
        for group in paren_matches:
            variants.add(normalize_catalog_text(group))
    return [v for v in variants if len(v) >= 2]


def build_medicine_search_surface(medicine: Medicine) -> str:
    parts = [
        medicine.generic_name,
        medicine.dosage_form,
        medicine.strength,
        *(a.get("name", "") for a in medicine.aliases),
    ]
    return normalize_catalog_text(" ".join(parts))


def detect_form_classes(text: str) -> set[str]:
    norm = normalize_catalog_text(text)
    classes: set[str] = set()
    if CONSUMABLE_HINT.search(norm):
        classes.add("consumable")
    if re.search(r"\binjection\b", norm):
        classes.add("injection")
    if re.search(r"\btopical\b", norm):
        classes.add("topical")
    if re.search(r"\bliquid\b", norm):
        classes.add("liquid")
    if re.search(r"\btablet\b", norm):
        classes.add("tablet")
    if not classes:
        classes.add("other")
    return classes


def primary_pharm_form(forms: set[str]) -> str | None:
    for form in ("tablet", "liquid", "injection", "topical"):
        if form in forms:
            return form
    return None


def forms_conflict(query: str, medicine: Medicine) -> bool:
    query_forms = detect_form_classes(query)
    med_forms = detect_form_classes(
        " ".join([medicine.generic_name, medicine.dosage_form, medicine.strength])
    )
    if query_forms.intersection({"consumable"}) != med_forms.intersection({"consumable"}):
        if "consumable" in query_forms and "consumable" not in med_forms:
            return True
        if "consumable" in med_forms and "consumable" not in query_forms:
            return True
    query_form = primary_pharm_form(query_forms)
    med_form = primary_pharm_form(med_forms)
    return bool(query_form and med_form and query_form != med_form)


def extract_strength_tokens(text: str) -> list[str]:
    matches = re.findall(
        r"\d+(?:\.\d+)?(?:mg|ml|mcg|g|%)(?:/\d+(?:\.\d+)?(?:mg|ml))?",
        text,
        re.I,
    )
    seen: list[str] = []
    for match in matches:
        token = compact_units(match.lower())
        if token not in seen:
            seen.append(token)
    return seen


def primary_mg_value(text: str) -> str | None:
    for token in extract_strength_tokens(text):
        match = re.match(r"^(\d+(?:\.\d+)?)mg", token, re.I)
        if match:
            return f"{match.group(1)}mg"
    return None


def strengths_conflict(query: str, medicine: Medicine) -> bool:
    query_mg = primary_mg_value(query)
    med_mg = primary_mg_value(
        " ".join([medicine.strength, medicine.generic_name, medicine.dosage_form])
    )
    if not query_mg or not med_mg:
        return False
    return query_mg != med_mg


def generic_match_score(query: str, medicine: Medicine) -> int:
    generic = normalize_catalog_text(medicine.generic_name)
    if not generic:
        return 0
    if query == generic:
        return 100
    if len(generic) >= 5 and generic in query:
        return 95
    generic_tokens = [t for t in generic.split() if len(t) >= 4]
    lead = " ".join(generic_tokens[:2])
    if len(lead) >= 8 and lead in query:
        return 90
    primary = generic_tokens[0] if generic_tokens else ""
    if (
        primary
        and len(primary) >= 5
        and primary not in WEAK_GENERIC_TOKENS
        and re.search(rf"\b{re.escape(primary)}\b", query)
    ):
        return 85
    return 0


def alias_match_score(query: str, medicine: Medicine) -> int:
    best = 0
    for alias in medicine.aliases:
        alias_norm = normalize_catalog_text(alias.get("name", ""))
        if not alias_norm or len(alias_norm) < 6:
            continue
        if alias_norm == query:
            best = max(best, 100)
            continue
        if query in alias_norm or alias_norm in query:
            generic_score = generic_match_score(query, medicine)
            if generic_score >= 85 or len(alias_norm) >= 12:
                best = max(best, 98)
            elif generic_score >= 0 and not forms_conflict(query, medicine):
                best = max(best, 88)
    return best


def token_overlap_score(query: str, surface: str) -> int:
    tokens = [
        token
        for token in query.split()
        if token not in WEAK_TOKENS and (len(token) >= 3 or re.search(r"\d", token))
    ]
    if not tokens:
        return 0
    matched = [token for token in tokens if token in surface]
    if len(matched) == len(tokens):
        return 70 if len(tokens) >= 4 else 55
    if len(matched) >= max(3, int(len(tokens) * 0.8 + 0.999)):
        return 45
    return 0


def consumable_match_score(query: str, medicine: Medicine) -> int:
    if not CONSUMABLE_HINT.search(query):
        return 0
    surface = build_medicine_search_surface(medicine)
    med_is_consumable = (
        "consumable" in detect_form_classes(surface) or CONSUMABLE_HINT.search(surface)
    )
    if not med_is_consumable:
        return 0
    hints = [
        "syringes", "syringe", "needles", "needle", "cannulas", "cannula",
        "gloves", "glove", "gauze", "plaster", "bandage", "mrdt", "tourniquet", "cotton",
    ]
    for hint in hints:
        if hint in query and hint in surface:
            return 98
    return 0


def score_query_against_medicine(query: str, medicine: Medicine, raw_query: str | None = None) -> int:
    raw = raw_query or query
    if not query or len(query) < 2:
        return 0
    consumable_score = consumable_match_score(raw, medicine)
    if consumable_score > 0:
        return consumable_score
    if forms_conflict(raw, medicine) or strengths_conflict(raw, medicine):
        return 0
    surface = build_medicine_search_surface(medicine)
    alias_score = alias_match_score(query, medicine)
    generic_score = generic_match_score(query, medicine)
    if alias_score >= 98:
        return alias_score
    if generic_score >= 95:
        return generic_score
    if generic_score >= 85:
        overlap = token_overlap_score(query, surface)
        if alias_score > 0:
            return max(alias_score, generic_score)
        return max(generic_score, min(generic_score, overlap + 10) if overlap > 0 else 0)
    if alias_score >= 88:
        return alias_score
    if generic_score == 0:
        return 0
    overlap = token_overlap_score(query, surface)
    return min(generic_score, overlap)


def score_catalog_match(raw_name: str, medicine: Medicine) -> int:
    raw_query = normalize_catalog_text(raw_name)
    if forms_conflict(raw_query, medicine) or strengths_conflict(raw_query, medicine):
        return 0
    best = 0
    for query in extract_query_variants(raw_name):
        best = max(best, score_query_against_medicine(query, medicine, raw_query))
    return best


def generic_prefix_match(base_name: str, generic_name: str) -> bool:
    base_norm = normalize_catalog_text(base_name)
    generic_norm = normalize_catalog_text(generic_name)
    if not base_norm or not generic_norm:
        return False
    base_lead = " ".join(base_norm.split()[:2])
    return len(base_lead) >= 8 and generic_norm.startswith(base_lead)


def confidence_from_score(score: int) -> str:
    if score >= BULK_MATCH_HIGH_THRESHOLD:
        return "HIGH"
    if score >= BULK_MATCH_LOW_THRESHOLD:
        return "LOW"
    return "NONE"


def medicine_from_export(row: dict) -> Medicine:
    return Medicine(
        generic_name=row.get("genericName", ""),
        dosage_form=row.get("dosageForm", ""),
        strength=row.get("strength", ""),
        search_key=row.get("searchKey", ""),
        aliases=[{"name": a} for a in row.get("aliases", [])],
    )


def medicine_for_alias_check(row: dict, alias_name: str) -> Medicine:
    """Medicine surface without the alias under test (avoid self-match)."""
    other_aliases = [
        {"name": a} for a in row.get("aliases", []) if a != alias_name
    ]
    return Medicine(
        generic_name=row.get("genericName", ""),
        dosage_form=row.get("dosageForm", ""),
        strength=row.get("strength", ""),
        aliases=other_aliases,
    )
