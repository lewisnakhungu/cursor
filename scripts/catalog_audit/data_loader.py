"""Load all catalog source files and the full export."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PATHS = {
    "export": ROOT / "data" / "catalog-full-export.json",
    "keml": ROOT / "data" / "final_keml_2023.json",
    "aliases": ROOT / "data" / "alias_names.json",
    "hybrid": ROOT / "docs" / "extended_hybrid_catalog.json",
    "kemsa": ROOT / "data" / "kemsa" / "kemsa_product_list.json",
}


@dataclass
class CatalogData:
    export: dict = field(default_factory=dict)
    keml: list[dict] = field(default_factory=list)
    aliases: list[dict] = field(default_factory=list)
    hybrid: list[dict] = field(default_factory=list)
    kemsa: dict = field(default_factory=dict)
    missing_files: list[str] = field(default_factory=list)


def load_json(path: Path) -> object:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_all(require_export: bool = True) -> CatalogData:
    data = CatalogData()

    for key, path in PATHS.items():
        if not path.exists():
            data.missing_files.append(str(path.relative_to(ROOT)))
            continue
        payload = load_json(path)
        if key == "export":
            data.export = payload
        elif key == "keml":
            data.keml = payload
        elif key == "aliases":
            data.aliases = payload
        elif key == "hybrid":
            data.hybrid = payload
        elif key == "kemsa":
            data.kemsa = payload

    if require_export and not data.export:
        raise FileNotFoundError(
            "Missing data/catalog-full-export.json — export the DB first:\n"
            "  npm run audit:catalog:export"
        )
    return data
