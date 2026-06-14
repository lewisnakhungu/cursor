"""Verify KEMSA scraped data quality."""
from __future__ import annotations

import re

from ..data_loader import CatalogData
from . import CheckResult, Finding

PRODUCT_CODE_RE = re.compile(r"^[A-Z]{2}\d{2}[A-Z]{3}\d{3}$")
GARBAGE_NAMES = re.compile(r"^(piece|pack|tube|each)(\s+\1)+$", re.I)


def run(data: CatalogData) -> CheckResult:
    findings: list[Finding] = []
    products = data.kemsa.get("products", [])
    stats: dict = {"products": len(products)}

    if not products:
        findings.append(Finding("error", "kemsa_data", "No KEMSA products loaded"))
        return CheckResult("kemsa_data", False, findings, stats)

    bad_codes = 0
    empty_names = 0
    garbage_names = 0
    prefix_counts: dict[str, int] = {}

    for product in products:
        code = product.get("productCode", "")
        name = product.get("productName", "").strip()
        prefix = product.get("codePrefix") or code[:2]

        prefix_counts[prefix] = prefix_counts.get(prefix, 0) + 1

        if not PRODUCT_CODE_RE.match(code):
            bad_codes += 1
        if not name:
            empty_names += 1
        elif len(name) < 4 or GARBAGE_NAMES.match(name):
            garbage_names += 1
            if garbage_names <= 10:
                findings.append(
                    Finding(
                        "warning",
                        "kemsa_data",
                        f"Suspicious KEMSA product name: {name!r}",
                        {"productCode": code},
                    )
                )

    stats["prefix_counts"] = prefix_counts
    stats["bad_codes"] = bad_codes
    stats["empty_names"] = empty_names
    stats["garbage_names"] = garbage_names

    if bad_codes:
        findings.append(
            Finding("error", "kemsa_data", f"{bad_codes} products with invalid productCode format")
        )
    if empty_names:
        findings.append(
            Finding("error", "kemsa_data", f"{empty_names} products with empty productName")
        )

    findings.append(
        Finding(
            "info",
            "kemsa_data",
            f"KEMSA products parsed: {len(products)} (PM={prefix_counts.get('PM', 0)}, NM={prefix_counts.get('NM', 0)})",
        )
    )

    passed = bad_codes == 0 and empty_names == 0
    return CheckResult("kemsa_data", passed, findings, stats)
