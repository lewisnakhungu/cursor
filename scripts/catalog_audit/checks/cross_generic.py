"""Detect aliases that clearly belong to a different drug generic."""
from __future__ import annotations

from ..catalog_match import normalize_catalog_text
from ..data_loader import CatalogData
from . import CheckResult, Finding

MAX_EXAMPLES = 50

# Distinct drug generics from hybrid catalog base names (high signal).
HYBRID_DRUG_ANCHORS = [
    "cetirizine",
    "paracetamol",
    "ibuprofen",
    "amoxicillin",
    "metformin",
    "ciprofloxacin",
    "fluconazole",
    "azithromycin",
    "co-trimoxazole",
    "chlorpheniramine",
]


def run(data: CatalogData) -> CheckResult:
    findings: list[Finding] = []
    medicines = data.export.get("medicines", [])
    violations = 0

    for med in medicines:
        med_generic = normalize_catalog_text(med.get("genericName", ""))

        for detail in med.get("aliasDetails") or []:
            alias = detail.get("name", "")
            if not alias:
                continue
            alias_norm = normalize_catalog_text(alias)

            for drug in HYBRID_DRUG_ANCHORS:
                if drug not in alias_norm:
                    continue
                if drug in med_generic:
                    continue
                # Combination products legitimately name multiple drugs
                if "+" in alias or "combination" in alias_norm:
                    continue
                # Alias names a drug that is NOT the medicine generic
                violations += 1
                if violations <= MAX_EXAMPLES:
                    findings.append(
                        Finding(
                            "error",
                            "cross_generic_contamination",
                            f"Alias contains {drug!r} but medicine is {med.get('genericName')!r}",
                            {
                                "alias": alias,
                                "source": detail.get("source"),
                            },
                        )
                    )
                break

    if violations > MAX_EXAMPLES:
        findings.append(
            Finding(
                "error",
                "cross_generic_contamination",
                f"... and {violations - MAX_EXAMPLES} more cross-generic violations",
            )
        )

    stats = {"violations": violations}
    if violations == 0:
        findings.append(
            Finding("info", "cross_generic_contamination", "No cross-generic contamination detected")
        )

    return CheckResult("cross_generic_contamination", violations == 0, findings, stats)
