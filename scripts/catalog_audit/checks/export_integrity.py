"""Verify catalog-full-export.json internal consistency."""
from __future__ import annotations

from ..catalog_match import normalize_catalog_text
from ..data_loader import CatalogData
from . import CheckResult, Finding


def run(data: CatalogData) -> CheckResult:
    findings: list[Finding] = []
    export = data.export
    medicines = export.get("medicines", [])
    summary = export.get("summary", {})

    stats = {
        "medicines": len(medicines),
        "total_aliases_listed": sum(len(m.get("aliases", [])) for m in medicines),
    }

    if not medicines:
        findings.append(Finding("error", "export_integrity", "Export has no medicines"))
        return CheckResult("export_integrity", False, findings, stats)

    if summary.get("searchableMedicines") != len(medicines):
        findings.append(
            Finding(
                "error",
                "export_integrity",
                "summary.searchableMedicines does not match medicines array",
                {"summary": summary.get("searchableMedicines"), "actual": len(medicines)},
            )
        )

    alias_count = 0
    unique_alias_count = 0
    source_counts: dict[str, int] = {}
    search_keys: dict[str, list[str]] = {}
    empty_generics = 0

    for med in medicines:
        generic = med.get("genericName", "").strip()
        if not generic:
            empty_generics += 1
        key = normalize_catalog_text(
            "|".join([
                med.get("genericName", ""),
                med.get("dosageForm", ""),
                med.get("strength", ""),
            ])
        )
        search_keys.setdefault(key, []).append(generic)

        aliases = med.get("aliases", [])
        details = med.get("aliasDetails", [])
        alias_count += len(aliases)

        if len(aliases) != len(details):
            findings.append(
                Finding(
                    "warning",
                    "export_integrity",
                    "aliases and aliasDetails length mismatch",
                    {"genericName": generic},
                )
            )

        for detail in details:
            source = detail.get("source", "UNKNOWN")
            source_counts[source] = source_counts.get(source, 0) + 1
            unique_alias_count += 1

        seen_alias: set[str] = set()
        for alias in aliases:
            norm = alias.strip().lower()
            if norm in seen_alias:
                findings.append(
                    Finding(
                        "warning",
                        "export_integrity",
                        f"Duplicate alias on same medicine: {alias}",
                        {"genericName": generic},
                    )
                )
            seen_alias.add(norm)

    stats["alias_count"] = unique_alias_count
    stats["alias_list_entries"] = alias_count
    stats["source_counts"] = source_counts

    reported = summary.get("totalActiveAliases")
    if reported is not None and reported != unique_alias_count:
        findings.append(
            Finding(
                "warning",
                "export_integrity",
                "summary.totalActiveAliases differs from aliasDetails count (re-export to refresh)",
                {"summary": reported, "aliasDetails": unique_alias_count},
            )
        )

    dup_keys = {k: v for k, v in search_keys.items() if len(v) > 1}
    if dup_keys:
        examples = [
            {"searchKey": k, "generics": v[:5]}
            for k, v in list(dup_keys.items())[:10]
        ]
        findings.append(
            Finding(
                "warning",
                "export_integrity",
                f"{len(dup_keys)} duplicate search keys (possible duplicate catalog rows)",
                {"examples": examples},
            )
        )

    if empty_generics:
        findings.append(
            Finding(
                "error",
                "export_integrity",
                f"{empty_generics} medicines with empty genericName",
            )
        )

    passed = not any(f.severity == "error" for f in findings)
    return CheckResult("export_integrity", passed, findings, stats)
