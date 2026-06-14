"""Verify hybrid catalog entries appear in the export (direct row or enriched aliases)."""
from __future__ import annotations

from ..catalog_match import normalize_catalog_text, score_catalog_match
from ..catalog_match import Medicine
from ..data_loader import CatalogData
from . import CheckResult, Finding


def run(data: CatalogData) -> CheckResult:
    findings: list[Finding] = []
    medicines = data.export.get("medicines", [])

    by_generic: dict[str, dict] = {}
    all_aliases: set[str] = set()
    for med in medicines:
        key = normalize_catalog_text(med.get("genericName", ""))
        by_generic[key] = med
        for alias in med.get("aliases", []):
            all_aliases.add(alias.strip().lower())

    missing = 0
    covered = 0

    for entry in data.hybrid:
        base = entry.get("base_name", "").strip()
        if not base:
            continue

        key = normalize_catalog_text(base)
        expected_names = {base.lower()} | {a.lower() for a in entry.get("aliases", []) if a}

        # Direct row match
        if key in by_generic:
            covered += 1
            continue

        # Aliases present anywhere in export (enriched onto KEML formulation)
        if expected_names & all_aliases:
            covered += 1
            continue

        # Score match against any export row
        best_score = 0
        for med in medicines:
            m = Medicine(
                generic_name=med.get("genericName", ""),
                dosage_form=med.get("dosageForm", ""),
                strength=med.get("strength", ""),
            )
            best_score = max(best_score, score_catalog_match(base, m))

        if best_score >= 90:
            covered += 1
            continue

        missing += 1
        if missing <= 15:
            findings.append(
                Finding(
                    "warning",
                    "hybrid_coverage",
                    f"Hybrid entry not reflected in export: {base}",
                    {"best_score": best_score},
                )
            )

    stats = {
        "hybrid_entries": len(data.hybrid),
        "covered": covered,
        "missing": missing,
    }

    if missing == 0:
        findings.append(
            Finding("info", "hybrid_coverage", f"All {len(data.hybrid)} hybrid entries covered in export")
        )

    return CheckResult("hybrid_coverage", missing == 0, findings, stats)
