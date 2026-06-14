# Catalog audit (Python)

Counter-checks the full AfyaSmart catalog: source JSON files, DB export, alias
plausibility, cross-generic contamination, hybrid coverage, KEMSA data, and
regression cases mirroring `src/lib/catalog-match.test.ts`.

## Setup

```bash
pip install psycopg2-binary   # only needed for DB export
```

## Run everything

```bash
# From afyasmart-app/
npm run audit:catalog
```

Or directly:

```bash
python3 -m catalog_audit.run_audit
```

## Options

```bash
# Use existing data/catalog-full-export.json (no DB connection)
python3 -m catalog_audit.run_audit --skip-export

# Fail on warnings too
python3 -m catalog_audit.run_audit --strict
```

## What gets checked

| Check | What it verifies |
|-------|------------------|
| `source_files` | All JSON sources exist and have valid structure |
| `regression_cases` | Python matcher matches TS test expectations |
| `export_integrity` | Export counts, duplicate keys, alias consistency |
| `alias_plausibility` | Every alias scores plausibly on its medicine |
| `cross_generic_contamination` | No cetirizine-on-paraffin style cross-links |
| `hybrid_coverage` | Hybrid catalog entries present in export |
| `kemsa_data` | KEMSA scrape quality (codes, names) |
| `cross_source` | alias_names.json reflected in export |

## Reports

Written to:

- `data/audit-reports/catalog-audit-latest.md`
- `data/audit-reports/catalog-audit-latest.json`

## Files

```
scripts/catalog_audit/
  run_audit.py          # main entry
  export_db.py          # DB → catalog-full-export.json
  catalog_match.py      # Python mirror of catalog-match.ts
  data_loader.py        # load all JSON sources
  report.py             # JSON + Markdown reports
  checks/               # individual verification modules
```

Keep `catalog_match.py` in sync when `src/lib/catalog-match.ts` changes.
