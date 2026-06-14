"""Write audit report as JSON and Markdown."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .checks import CheckResult, Finding

ROOT = Path(__file__).resolve().parents[2]
REPORT_DIR = ROOT / "data" / "audit-reports"


def finding_to_dict(f: Finding) -> dict:
    return {
        "severity": f.severity,
        "check": f.check,
        "message": f.message,
        "details": f.details,
    }


def result_to_dict(r: CheckResult) -> dict:
    return {
        "name": r.name,
        "passed": r.passed,
        "errors": r.errors,
        "warnings": r.warnings,
        "stats": r.stats,
        "findings": [finding_to_dict(f) for f in r.findings],
    }


def write_reports(results: list[CheckResult], export_path: str) -> tuple[Path, Path]:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    total_errors = sum(r.errors for r in results)
    total_warnings = sum(r.warnings for r in results)
    all_passed = all(r.passed for r in results)

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "exportFile": export_path,
        "summary": {
            "passed": all_passed,
            "checks_run": len(results),
            "checks_passed": sum(1 for r in results if r.passed),
            "checks_failed": sum(1 for r in results if not r.passed),
            "total_errors": total_errors,
            "total_warnings": total_warnings,
        },
        "checks": [result_to_dict(r) for r in results],
    }

    json_path = REPORT_DIR / f"catalog-audit-{ts}.json"
    md_path = REPORT_DIR / f"catalog-audit-{ts}.md"
    latest_json = REPORT_DIR / "catalog-audit-latest.json"
    latest_md = REPORT_DIR / "catalog-audit-latest.md"

    json_text = json.dumps(payload, indent=2) + "\n"
    json_path.write_text(json_text, encoding="utf-8")
    latest_json.write_text(json_text, encoding="utf-8")

    md_lines = [
        "# Catalog audit report",
        "",
        f"Generated: {payload['generatedAt']}",
        f"Export: `{export_path}`",
        "",
        "## Summary",
        "",
        f"- **Overall:** {'PASS' if all_passed else 'FAIL'}",
        f"- **Checks:** {payload['summary']['checks_passed']}/{payload['summary']['checks_run']} passed",
        f"- **Errors:** {total_errors}",
        f"- **Warnings:** {total_warnings}",
        "",
        "## Check results",
        "",
    ]

    for result in results:
        status = "PASS" if result.passed else "FAIL"
        md_lines.append(f"### {result.name} — {status}")
        md_lines.append("")
        if result.stats:
            md_lines.append("Stats:")
            for key, value in result.stats.items():
                md_lines.append(f"- `{key}`: {value}")
            md_lines.append("")

        errors = [f for f in result.findings if f.severity == "error"]
        warnings = [f for f in result.findings if f.severity == "warning"]
        infos = [f for f in result.findings if f.severity == "info"]

        if errors:
            md_lines.append("**Errors:**")
            for f in errors[:30]:
                md_lines.append(f"- {f.message}")
                if f.details:
                    md_lines.append(f"  ```json\n  {json.dumps(f.details, indent=2)}\n  ```")
            if len(errors) > 30:
                md_lines.append(f"- ... and {len(errors) - 30} more")
            md_lines.append("")

        if warnings:
            md_lines.append("**Warnings:**")
            for f in warnings[:20]:
                md_lines.append(f"- {f.message}")
            if len(warnings) > 20:
                md_lines.append(f"- ... and {len(warnings) - 20} more")
            md_lines.append("")

        if infos and not errors and not warnings:
            for f in infos:
                md_lines.append(f"- {f.message}")
            md_lines.append("")

    md_text = "\n".join(md_lines) + "\n"
    md_path.write_text(md_text, encoding="utf-8")
    latest_md.write_text(md_text, encoding="utf-8")

    return latest_json, latest_md
