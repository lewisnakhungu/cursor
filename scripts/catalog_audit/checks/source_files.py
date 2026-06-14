"""Verify source JSON files exist and have valid structure."""
from __future__ import annotations

from ..data_loader import CatalogData, PATHS, ROOT
from . import CheckResult, Finding

VALID_ITEM_TYPES = {"OTC", "MEDICINE", "SUPPLEMENT", "CONSUMABLE", "DIAGNOSTIC"}


def run(data: CatalogData) -> CheckResult:
    findings: list[Finding] = []
    stats: dict = {}

    for key, path in PATHS.items():
        rel = str(path.relative_to(ROOT))
        if rel in data.missing_files:
            findings.append(Finding("error", "source_files", f"Missing file: {rel}"))
            continue
        findings.append(Finding("info", "source_files", f"Found {rel}"))

    if data.keml:
        stats["keml_rows"] = len(data.keml)
        for i, row in enumerate(data.keml[:5]):
            if not row.get("generic_name"):
                findings.append(
                    Finding(
                        "error",
                        "source_files",
                        f"KEML row {i} missing generic_name",
                        {"row": row},
                    )
                )

    if data.aliases:
        stats["alias_generics"] = len(data.aliases)
        empty = [r for r in data.aliases if not r.get("generic_name", "").strip()]
        if empty:
            findings.append(
                Finding(
                    "error",
                    "source_files",
                    f"{len(empty)} alias_names rows missing generic_name",
                )
            )
        dupes: dict[str, int] = {}
        for row in data.aliases:
            key = row.get("generic_name", "").strip().lower()
            dupes[key] = dupes.get(key, 0) + 1
        duplicate_generics = [k for k, v in dupes.items() if v > 1]
        if duplicate_generics:
            findings.append(
                Finding(
                    "warning",
                    "source_files",
                    f"Duplicate generic_name entries in alias_names.json: {len(duplicate_generics)}",
                    {"examples": duplicate_generics[:10]},
                )
            )

    if data.hybrid:
        stats["hybrid_entries"] = len(data.hybrid)
        for i, row in enumerate(data.hybrid):
            if not row.get("base_name", "").strip():
                findings.append(
                    Finding("error", "source_files", f"Hybrid entry {i} missing base_name")
                )
            item_type = row.get("item_type", "")
            if item_type and item_type not in VALID_ITEM_TYPES:
                findings.append(
                    Finding(
                        "warning",
                        "source_files",
                        f"Hybrid entry {i} unknown item_type: {item_type}",
                        {"base_name": row.get("base_name")},
                    )
                )

    if data.kemsa:
        products = data.kemsa.get("products", [])
        stats["kemsa_products"] = len(products)
        if data.kemsa.get("productCount") != len(products):
            findings.append(
                Finding(
                    "error",
                    "source_files",
                    "KEMSA productCount header does not match products array length",
                    {
                        "header": data.kemsa.get("productCount"),
                        "actual": len(products),
                    },
                )
            )
        codes = [p.get("productCode") for p in products if p.get("productCode")]
        dup_code_list = [c for c in codes if codes.count(c) > 1]
        if dup_code_list:
            findings.append(
                Finding(
                    "warning",
                    "source_files",
                    f"Duplicate KEMSA product codes: {len(set(dup_code_list))}",
                    {"examples": list(set(dup_code_list))[:5]},
                )
            )

    passed = not any(f.severity == "error" for f in findings)
    return CheckResult("source_files", passed, findings, stats)
