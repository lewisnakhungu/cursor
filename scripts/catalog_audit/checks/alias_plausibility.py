"""Flag aliases not backed by source data or matcher rules."""
from __future__ import annotations

from ..catalog_match import (
    BULK_MATCH_HIGH_THRESHOLD,
    BULK_MATCH_LOW_THRESHOLD,
    generic_prefix_match,
    medicine_for_alias_check,
    normalize_catalog_text,
    score_catalog_match,
)
from ..data_loader import CatalogData
from . import CheckResult, Finding

MAX_EXAMPLES = 50


def build_brand_seed_truth(data: CatalogData) -> set[tuple[str, str]]:
    """(normalized generic, alias lower) pairs from alias_names.json."""
    truth: set[tuple[str, str]] = set()
    for row in data.aliases:
        generic = normalize_catalog_text(row.get("generic_name", ""))
        if not generic:
            continue
        for alias in row.get("aliases", []):
            if alias.strip():
                truth.add((generic, alias.strip().lower()))
    return truth


def build_hybrid_truth(data: CatalogData) -> set[tuple[str, str]]:
    """(normalized base_name, alias lower) pairs from hybrid catalog."""
    truth: set[tuple[str, str]] = set()
    for row in data.hybrid:
        base = normalize_catalog_text(row.get("base_name", ""))
        if not base:
            continue
        names = [row.get("base_name", "")] + list(row.get("aliases", []))
        for name in names:
            if name.strip():
                truth.add((base, name.strip().lower()))
    return truth


def build_kemsa_truth(data: CatalogData) -> set[str]:
    names: set[str] = set()
    for product in data.kemsa.get("products", []):
        name = product.get("productName", "").strip()
        pack = product.get("packSize", "").strip()
        if name:
            names.add(name.lower())
            if pack:
                names.add(f"{name} ({pack})".lower())
    return names


def is_stub_formulation(med: dict) -> bool:
    form = normalize_catalog_text(med.get("dosageForm", ""))
    strength = normalize_catalog_text(med.get("strength", ""))
    return "as per keml" in form or "as per clinical" in strength


def alias_is_valid(
    alias_name: str,
    med: dict,
    source: str,
    brand_truth: set[tuple[str, str]],
    hybrid_truth: set[tuple[str, str]],
    kemsa_truth: set[str],
) -> tuple[bool, int, str]:
    medicine = medicine_for_alias_check(med, alias_name)
    score = score_catalog_match(alias_name, medicine)
    generic_norm = normalize_catalog_text(med.get("genericName", ""))
    alias_lower = alias_name.strip().lower()
    alias_norm = normalize_catalog_text(alias_name)

    if alias_norm == generic_norm or alias_norm.startswith(generic_norm + " "):
        return True, score, "matches genericName"

    if generic_prefix_match(alias_name, med.get("genericName", "")):
        return True, score, "generic prefix match"

    if source == "BRAND_SEED":
        if (generic_norm, alias_lower) in brand_truth:
            return True, score, "listed in alias_names.json"
        # Also valid on any formulation sharing the same generic
        if any(g == generic_norm for g, a in brand_truth if a == alias_lower):
            return True, score, "brand alias for this generic"

    if source == "HYBRID":
        if (generic_norm, alias_lower) in hybrid_truth:
            return True, score, "listed in hybrid catalog"
        # Enriched onto KEML stub or formulation row
        for base, alias in hybrid_truth:
            if alias == alias_lower:
                return True, score, "hybrid alias present in catalog"
        # Alternate consumable naming (Branula vs IV Cannula)
        if score >= BULK_MATCH_LOW_THRESHOLD:
            return True, score, "HYBRID with LOW+ score"

    if source == "KEMSA":
        if alias_lower in kemsa_truth:
            if score >= BULK_MATCH_LOW_THRESHOLD or generic_norm in alias_norm:
                return True, score, "KEMSA product with plausible match"
            # Non-pharm KEMSA row: genericName IS the product name
            if med.get("itemType") == "NON_PHARM" and alias_lower == generic_norm.lower():
                return True, score, "KEMSA non-pharm self-alias"

    if score >= BULK_MATCH_HIGH_THRESHOLD:
        return True, score, "HIGH match score"

    if is_stub_formulation(med) and source == "BRAND_SEED" and len(alias_name) >= 4:
        if (generic_norm, alias_lower) in brand_truth:
            return True, score, "brand on KEML stub"

    return False, score, "not in source truth and score too low"


def run(data: CatalogData) -> CheckResult:
    findings: list[Finding] = []
    medicines = data.export.get("medicines", [])

    brand_truth = build_brand_seed_truth(data)
    hybrid_truth = build_hybrid_truth(data)
    kemsa_truth = build_kemsa_truth(data)

    checked = 0
    failed = 0
    by_source: dict[str, int] = {}

    for med in medicines:
        details = med.get("aliasDetails") or [
            {"name": a, "source": "UNKNOWN"} for a in med.get("aliases", [])
        ]
        for detail in details:
            alias_name = detail.get("name", "")
            source = detail.get("source", "UNKNOWN")
            if not alias_name:
                continue
            checked += 1
            ok, score, reason = alias_is_valid(
                alias_name, med, source, brand_truth, hybrid_truth, kemsa_truth
            )
            if ok:
                continue
            failed += 1
            by_source[source] = by_source.get(source, 0) + 1
            if failed <= MAX_EXAMPLES:
                findings.append(
                    Finding(
                        "error",
                        "alias_plausibility",
                        f"Unverified alias on {med.get('genericName')!r}",
                        {
                            "alias": alias_name,
                            "source": source,
                            "score": score,
                            "reason": reason,
                        },
                    )
                )

    if failed > MAX_EXAMPLES:
        findings.append(
            Finding(
                "error",
                "alias_plausibility",
                f"... and {failed - MAX_EXAMPLES} more unverified aliases",
            )
        )

    stats = {
        "aliases_checked": checked,
        "unverified": failed,
        "unverified_by_source": by_source,
    }

    if failed == 0:
        findings.append(
            Finding(
                "info",
                "alias_plausibility",
                f"All {checked} aliases verified against source files or matcher",
            )
        )

    return CheckResult("alias_plausibility", failed == 0, findings, stats)
