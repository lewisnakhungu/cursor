#!/usr/bin/env python3
"""Run full catalog verification suite."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from catalog_audit.data_loader import PATHS, ROOT, load_all
from catalog_audit.report import write_reports
from catalog_audit.checks.source_files import run as check_source_files
from catalog_audit.checks.export_integrity import run as check_export_integrity
from catalog_audit.checks.alias_plausibility import run as check_alias_plausibility
from catalog_audit.checks.cross_generic import run as check_cross_generic
from catalog_audit.checks.hybrid_coverage import run as check_hybrid_coverage
from catalog_audit.checks.kemsa_data import run as check_kemsa_data
from catalog_audit.checks.regression_cases import run as check_regression_cases
from catalog_audit.checks.cross_source import run as check_cross_source

CHECKS = [
    check_source_files,
    check_regression_cases,
    check_export_integrity,
    check_alias_plausibility,
    check_cross_generic,
    check_hybrid_coverage,
    check_kemsa_data,
    check_cross_source,
]


def maybe_export(skip_export: bool) -> None:
    if skip_export and PATHS["export"].exists():
        print(f"Using existing export: {PATHS['export'].relative_to(ROOT)}")
        return
    print("Exporting database to catalog-full-export.json …")
    from catalog_audit import export_db

    rc = export_db.main()
    if rc != 0:
        print(
            "\nExport failed. Install: pip install psycopg2-binary\n"
            "Or use: npm run audit:catalog -- --skip-export\n",
            file=sys.stderr,
        )
        if not PATHS["export"].exists():
            sys.exit(1)
        print("Continuing with stale export file.", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify AfyaSmart catalog data")
    parser.add_argument(
        "--skip-export",
        action="store_true",
        help="Use existing data/catalog-full-export.json",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as failures",
    )
    args = parser.parse_args()

    maybe_export(args.skip_export)

    print("Loading catalog data …")
    data = load_all(require_export=True)

    results = []
    for check_fn in CHECKS:
        name = check_fn.__module__.split(".")[-1]
        print(f"  ▶ {name}")
        result = check_fn(data)
        status = "PASS" if result.passed else "FAIL"
        print(f"    {status} — {result.errors} errors, {result.warnings} warnings")
        results.append(result)

    json_path, md_path = write_reports(results, str(PATHS["export"].relative_to(ROOT)))

    checks_failed = sum(1 for r in results if not r.passed)
    total_errors = sum(r.errors for r in results)
    total_warnings = sum(r.warnings for r in results)

    print()
    print("=" * 60)
    print(f"Overall: {'PASS' if checks_failed == 0 else 'FAIL'}")
    print(f"Checks failed: {checks_failed}/{len(results)}")
    print(f"Errors: {total_errors}  Warnings: {total_warnings}")
    print(f"Report: {md_path.relative_to(ROOT)}")
    print(f"JSON:   {json_path.relative_to(ROOT)}")
    print("=" * 60)

    if checks_failed > 0:
        return 1
    if args.strict and total_warnings > 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
