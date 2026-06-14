#!/usr/bin/env python3
"""
Export the live catalog database to data/catalog-full-export.json.

Requires DATABASE_URL in .env.local / .env (same as Prisma).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "catalog-full-export.json"


def load_env() -> None:
    for name in (".env.local", ".env"):
        path = ROOT / name
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main() -> int:
    load_env()
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        return 1

    try:
        import psycopg2  # type: ignore
        import psycopg2.extras  # type: ignore
    except ImportError:
        print(
            "ERROR: psycopg2 not installed. Run: pip install psycopg2-binary",
            file=sys.stderr,
        )
        return 1

    conn = psycopg2.connect(url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        """
        SELECT id, "genericName", "dosageForm", strength, "itemType",
               category, "kemlCode", "isStub"
        FROM medicines
        WHERE "isStub" = false
        ORDER BY "genericName", "dosageForm", strength
        """
    )
    meds = cur.fetchall()

    cur.execute(
        """
        SELECT "medicineId", name, source, status
        FROM medicine_aliases
        WHERE status = 'ACTIVE'
        ORDER BY name
        """
    )
    aliases = cur.fetchall()

    by_med: dict[str, list[dict]] = {}
    source_counts: dict[str, int] = {}
    for row in aliases:
        mid = row["medicineId"]
        by_med.setdefault(mid, []).append({"name": row["name"], "source": row["source"]})
        source_counts[row["source"]] = source_counts.get(row["source"], 0) + 1

    items = []
    for med in meds:
        mid = med["id"]
        details = by_med.get(mid, [])
        items.append(
            {
                "genericName": med["genericName"],
                "dosageForm": med["dosageForm"],
                "strength": med["strength"],
                "itemType": med["itemType"],
                "category": med["category"],
                "kemlCode": med["kemlCode"],
                "aliases": [d["name"] for d in details],
                "aliasDetails": details,
            }
        )

    from datetime import datetime, timezone

    payload = {
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "searchableMedicines": len(items),
            "totalActiveAliases": len(aliases),
            "aliasesBySource": source_counts,
            "withAliases": sum(1 for i in items if i["aliases"]),
            "withoutAliases": sum(1 for i in items if not i["aliases"]),
        },
        "sourceFiles": [
            "data/final_keml_2023.json",
            "data/alias_names.json",
            "docs/extended_hybrid_catalog.json",
            "data/kemsa/kemsa_product_list.json",
        ],
        "medicines": items,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"path": str(OUT), **payload["summary"]}, indent=2))
    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
