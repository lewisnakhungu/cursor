"""Regression cases mirroring src/lib/catalog-match.test.ts."""
from __future__ import annotations

from ..catalog_match import BULK_MATCH_LOW_THRESHOLD, Medicine, score_catalog_match
from . import CheckResult, Finding


def med(**kwargs) -> Medicine:
    defaults = {"dosage_form": "", "strength": "", "search_key": "", "aliases": []}
    generic = kwargs.pop("generic_name")
    if "dosage_form" in kwargs:
        defaults["dosage_form"] = kwargs.pop("dosage_form")
    if "strength" in kwargs:
        defaults["strength"] = kwargs.pop("strength")
    if "aliases" in kwargs:
        defaults["aliases"] = [{"name": a} for a in kwargs.pop("aliases")]
    return Medicine(generic_name=generic, **defaults, **kwargs)


SHOULD_MATCH = [
    (
        "CTX (Co-trimoxazole) Suspension 240mg/5ml",
        med(
            generic_name="Co-trimoxazole (Sulfamethoxazole + Trimethoprim)",
            dosage_form="Oral liquid",
            strength="240mg/5mL [c]",
            aliases=["Septrin Suspension"],
        ),
    ),
    (
        "Cetirizine 10mg Tablet",
        med(
            generic_name="Cetirizine",
            dosage_form="As per KEML listing",
            strength="As per clinical need",
        ),
    ),
]

SHOULD_NOT_MATCH = [
    (
        "Cetirizine 5mg/5ml Syrup",
        med(generic_name="Liquid paraffin", dosage_form="Nasal drops", strength="100%"),
        "cetirizine vs liquid paraffin",
    ),
    (
        "Fluconazole Capsules 200mg (Refill Lot)",
        med(generic_name="Fluconazole", dosage_form="Oral liquid", strength="50mg/5mL"),
        "fluconazole capsules vs oral liquid",
    ),
    (
        "Griseofulvin Tablets 500mg",
        med(generic_name="Griseofulvin", dosage_form="Tablet", strength="125mg"),
        "griseofulvin strength mismatch",
    ),
    (
        "Diclofenac Sodium Injection 75mg/3ml",
        med(generic_name="Paracetamol", dosage_form="vial", strength="10mg/mL (1oomL )"),
        "diclofenac injection vs paracetamol vial",
    ),
    (
        "Acyclovir Tablets 400mg (30 Tabs per Pack)",
        med(generic_name="Oral rehydration salts (ORS)", dosage_form="Sachet (WHO low-", strength=""),
        "acyclovir vs ORS",
    ),
]


def run(_data) -> CheckResult:
    findings: list[Finding] = []
    failed = 0

    for query, medicine in SHOULD_MATCH:
        score = score_catalog_match(query, medicine)
        if score < BULK_MATCH_LOW_THRESHOLD:
            failed += 1
            findings.append(
                Finding(
                    "error",
                    "regression_cases",
                    f"Expected match but got score {score}",
                    {"query": query, "generic": medicine.generic_name},
                )
            )

    for query, medicine, label in SHOULD_NOT_MATCH:
        score = score_catalog_match(query, medicine)
        if score >= BULK_MATCH_LOW_THRESHOLD:
            failed += 1
            findings.append(
                Finding(
                    "error",
                    "regression_cases",
                    f"False positive ({label}): score {score}",
                    {"query": query, "generic": medicine.generic_name},
                )
            )

    stats = {
        "should_match": len(SHOULD_MATCH),
        "should_not_match": len(SHOULD_NOT_MATCH),
        "failed": failed,
    }

    if failed == 0:
        findings.append(
            Finding("info", "regression_cases", "All regression match cases passed")
        )

    return CheckResult("regression_cases", failed == 0, findings, stats)
