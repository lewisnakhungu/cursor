#!/usr/bin/env python3
"""
Reconcile KEMSA product list against catalog export and hybrid catalog.

Usage:
  PYTHONPATH=scripts python3 -m catalog_audit.reconcile_kemsa
  PYTHONPATH=scripts python3 -m catalog_audit.reconcile_kemsa --apply-hybrid
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "catalog_audit"))

from catalog_match import (  # noqa: E402
    BULK_MATCH_HIGH_THRESHOLD,
    BULK_MATCH_LOW_THRESHOLD,
    Medicine,
    normalize_catalog_text,
    score_catalog_match,
)

KEMSA_JSON = ROOT / "data" / "kemsa" / "kemsa_product_list.json"
EXPORT_JSON = ROOT / "data" / "catalog-full-export.json"
HYBRID_JSON = ROOT / "docs" / "extended_hybrid_catalog.json"
REPORT_JSON = ROOT / "data" / "kemsa" / "kemsa-reconciliation-report.json"
SOURCE_PDF = ROOT / "data" / "kemsa" / "PRODUCT_LIST.pdf"

WEAK = {
    "tablet", "tablets", "capsule", "capsules", "syrup", "suspension", "injection",
    "liquid", "oral", "mg", "ml", "pack", "piece", "each", "pair", "s", "of",
}


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def is_garbage_name(name: str) -> bool:
    norm = normalize_catalog_text(name)
    if len(norm) < 4:
        return True
    if re.fullmatch(r"(piece|pack|tube|each)( piece| pack)*", norm):
        return True
    if norm.count("piece") >= 3:
        return True
    return False


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_catalog_text(a), normalize_catalog_text(b)).ratio()


def anchor_tokens(text: str) -> set[str]:
    norm = normalize_catalog_text(text)
    return {t for t in norm.split() if len(t) >= 4 and t not in WEAK}


def build_medicine_index(medicines: list[dict]) -> tuple[list[dict], dict[str, list[int]]]:
    index: dict[str, list[int]] = {}
    for i, med in enumerate(medicines):
        tokens = anchor_tokens(med.get("genericName", ""))
        tokens.update(anchor_tokens(med.get("dosageForm", "")))
        tokens.update(anchor_tokens(med.get("strength", "")))
        for alias in med.get("aliases", []):
            tokens.update(anchor_tokens(alias))
        for token in tokens:
            index.setdefault(token, []).append(i)
    return medicines, index


def find_best_catalog_match(
    product_name: str,
    medicines: list[dict],
    index: dict[str, list[int]],
) -> tuple[dict | None, int]:
    candidates: set[int] = set()
    for token in anchor_tokens(product_name):
        candidates.update(index.get(token, []))

    if not candidates:
        # Fallback: first word of product
        first = normalize_catalog_text(product_name).split()[0] if product_name else ""
        if len(first) >= 5:
            candidates.update(index.get(first, []))

    if not candidates:
        return None, 0

    best_med: dict | None = None
    best_score = 0
    for idx in candidates:
        med = medicines[idx]
        m = Medicine(
            generic_name=med.get("genericName", ""),
            dosage_form=med.get("dosageForm", ""),
            strength=med.get("strength", ""),
            aliases=[{"name": a} for a in med.get("aliases", [])],
        )
        score = score_catalog_match(product_name, m)
        if score > best_score:
            best_score = score
            best_med = med
    return best_med, best_score


def reparse_kemsa_pdf() -> None:
    subprocess.run(
        ["npm", "run", "scrape:kemsa", "--", "--skip-download"],
        cwd=ROOT,
        check=True,
    )


def build_hybrid_alias_additions(
    matched: list[dict],
    hybrid: list[dict],
) -> list[dict]:
    suggestions: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for item in matched:
        kemsa_name = item["kemsa_name"]
        catalog_generic = item.get("catalog_generic") or ""
        if not catalog_generic:
            continue

        for entry in hybrid:
            base = entry.get("base_name", "")
            base_norm = normalize_catalog_text(base)
            cat_norm = normalize_catalog_text(catalog_generic)
            if not (
                cat_norm in base_norm
                or base_norm in cat_norm
                or similarity(base, catalog_generic) >= 0.72
            ):
                continue

            existing = {a.lower() for a in entry.get("aliases", [])}
            key = (base, kemsa_name.lower())
            if kemsa_name.lower() in existing or kemsa_name.lower() == base.lower():
                break
            if key in seen:
                break
            seen.add(key)
            suggestions.append(
                {
                    "hybrid_base_name": base,
                    "add_alias": kemsa_name,
                    "reason": "KEMSA canonical supplier name",
                }
            )
            break
    return suggestions


def apply_hybrid_aliases(suggestions: list[dict]) -> int:
    hybrid: list[dict] = load_json(HYBRID_JSON)  # type: ignore
    applied = 0
    by_base = {h["base_name"]: h for h in hybrid}

    for sug in suggestions:
        entry = by_base.get(sug["hybrid_base_name"])
        if not entry:
            continue
        aliases = entry.setdefault("aliases", [])
        alias = sug["add_alias"]
        if alias not in aliases:
            aliases.append(alias)
            applied += 1

    if applied:
        HYBRID_JSON.write_text(json.dumps(hybrid, indent=2) + "\n", encoding="utf-8")
    return applied


def run_reconcile(apply_hybrid: bool = False) -> dict:
    print("Re-parsing KEMSA PDF …")
    reparse_kemsa_pdf()

    kemsa_payload = load_json(KEMSA_JSON)
    products = [
        p for p in kemsa_payload.get("products", [])
        if not is_garbage_name(p.get("productName", ""))
    ]

    export = load_json(EXPORT_JSON) if EXPORT_JSON.exists() else {"medicines": []}
    medicines: list[dict] = export.get("medicines", [])
    hybrid: list[dict] = load_json(HYBRID_JSON)  # type: ignore
    medicines, med_index = build_medicine_index(medicines)

    matched_high: list[dict] = []
    matched_low: list[dict] = []
    unmatched: list[dict] = []
    spelling_notes: list[dict] = []

    export_kemsa_aliases = {
        d.get("name", "").lower()
        for med in medicines
        for d in med.get("aliasDetails", [])
        if d.get("source") == "KEMSA"
    }

    print(f"Matching {len(products)} KEMSA products against {len(medicines)} catalog rows …")

    for i, product in enumerate(products):
        if i and i % 200 == 0:
            print(f"  … {i}/{len(products)}")

        name = product.get("productName", "").strip()
        code = product.get("productCode", "")
        if not name:
            continue

        med, score = find_best_catalog_match(name, medicines, med_index)
        record = {
            "productCode": code,
            "kemsa_name": name,
            "packSize": product.get("packSize", ""),
            "category": product.get("category", ""),
            "match_score": score,
            "catalog_generic": med.get("genericName") if med else None,
            "in_db_as_kemsa_alias": name.lower() in export_kemsa_aliases,
        }

        if score >= BULK_MATCH_HIGH_THRESHOLD:
            matched_high.append(record)
        elif score >= BULK_MATCH_LOW_THRESHOLD:
            matched_low.append(record)
        else:
            unmatched.append(record)

        if med and score >= BULK_MATCH_LOW_THRESHOLD:
            kemsa_norm = normalize_catalog_text(name)
            generic_norm = normalize_catalog_text(med.get("genericName", ""))
            if (
                generic_norm
                and generic_norm not in kemsa_norm
                and kemsa_norm not in generic_norm
                and similarity(name, med.get("genericName", "")) < 0.88
            ):
                spelling_notes.append(
                    {
                        "kemsa_name": name,
                        "catalog_generic": med.get("genericName"),
                        "score": score,
                    }
                )

    hybrid_suggestions = build_hybrid_alias_additions(matched_high + matched_low, hybrid)
    missing_from_db = [
        r for r in matched_high + matched_low if not r["in_db_as_kemsa_alias"]
    ]

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourcePdf": str(SOURCE_PDF.relative_to(ROOT)),
        "summary": {
            "kemsa_products_usable": len(products),
            "kemsa_products_parsed_total": kemsa_payload.get("productCount"),
            "matched_high": len(matched_high),
            "matched_low": len(matched_low),
            "unmatched": len(unmatched),
            "missing_kemsa_alias_in_db": len(missing_from_db),
            "spelling_differences": len(spelling_notes),
            "hybrid_alias_suggestions": len(hybrid_suggestions),
        },
        "unmatched_products": unmatched[:300],
        "missing_kemsa_aliases_in_db": missing_from_db[:300],
        "spelling_differences": spelling_notes[:300],
        "hybrid_alias_suggestions": hybrid_suggestions[:300],
        "garbage_skipped": kemsa_payload.get("productCount", 0) - len(products),
    }

    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if apply_hybrid and hybrid_suggestions:
        applied = apply_hybrid_aliases(hybrid_suggestions)
        report["summary"]["hybrid_aliases_applied"] = applied
        print(f"Applied {applied} hybrid alias additions")

    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Reconcile KEMSA list with catalog")
    parser.add_argument(
        "--apply-hybrid",
        action="store_true",
        help="Add KEMSA canonical names to hybrid catalog aliases",
    )
    args = parser.parse_args()

    if not EXPORT_JSON.exists():
        print("Exporting catalog from DB …")
        subprocess.run(["npm", "run", "audit:catalog:export"], cwd=ROOT, check=False)

    report = run_reconcile(apply_hybrid=args.apply_hybrid)
    print(json.dumps(report["summary"], indent=2))
    print(f"\nFull report: {REPORT_JSON.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
