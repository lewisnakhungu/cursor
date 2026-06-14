"""Cross-check source files against the export."""
from __future__ import annotations

from ..catalog_match import normalize_catalog_text
from ..data_loader import CatalogData
from . import CheckResult, Finding


def run(data: CatalogData) -> CheckResult:
    findings: list[Finding] = []
    medicines = data.export.get("medicines", [])

    export_generics = {normalize_catalog_text(m.get("genericName", "")) for m in medicines}
    export_alias_set: set[str] = set()
    for med in medicines:
        for alias in med.get("aliases", []):
            export_alias_set.add(alias.strip().lower())

    # alias_names.json: every generic should exist in export (KEML stub or formulation)
    missing_keml_generics = 0
    for row in data.aliases:
        generic = normalize_catalog_text(row.get("generic_name", ""))
        if not generic:
            continue
        if not any(generic in g or g.startswith(generic.split()[0]) for g in export_generics if g):
            # Check if any export row contains this generic as substring
            if not any(generic in eg for eg in export_generics):
                missing_keml_generics += 1
                if missing_keml_generics <= 10:
                    findings.append(
                        Finding(
                            "warning",
                            "cross_source",
                            f"alias_names generic not found in export: {row.get('generic_name')}",
                        )
                    )

    # brand aliases from alias_names should appear somewhere in export
    missing_brand_aliases = 0
    for row in data.aliases:
        for alias in row.get("aliases", []):
            if alias.strip().lower() not in export_alias_set:
                missing_brand_aliases += 1
                if missing_brand_aliases <= 10:
                    findings.append(
                        Finding(
                            "warning",
                            "cross_source",
                            f"Brand alias from alias_names.json not in export: {alias}",
                            {"generic": row.get("generic_name")},
                        )
                    )

    stats = {
        "export_generics": len(export_generics),
        "export_aliases": len(export_alias_set),
        "missing_keml_generics": missing_keml_generics,
        "missing_brand_aliases": missing_brand_aliases,
    }

    if missing_keml_generics == 0 and missing_brand_aliases == 0:
        findings.append(
            Finding("info", "cross_source", "Source alias_names.json fully reflected in export")
        )

    passed = missing_keml_generics == 0
    return CheckResult("cross_source", passed, findings, stats)
