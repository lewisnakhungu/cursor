# Catalog ingestion & learning

AfyaSmart-Stock uses a **layered catalog** so bulk import, receive, and POS search understand Kenyan supplier naming — not just KEML generic names.

## Data layers

| Layer | Source file | Seed command | Purpose |
|-------|-------------|--------------|---------|
| **KEML 2023** | `data/final_keml_2023.json` | `npm run db:seed` | National formulary — generics, forms, strengths |
| **Brand aliases** | `data/alias_names.json` | `npm run db:seed-aliases` | Trade names (Panadol, Septrin, …) |
| **Hybrid catalog** | `docs/extended_hybrid_catalog.json` | `npm run db:seed-hybrid-catalog` | Facility list + non-pharm + MOH-style names |
| **KEMSA catalog** | `data/kemsa/kemsa_product_list.json` | `npm run db:seed-kemsa` | Public KEMSA SKU names + pack sizes |
| **Import learning** | Bulk receive UI | automatic | Supplier labels staff confirm manually |

Run everything in order:

```bash
npm run db:seed-catalog
```

Refresh KEMSA data from the public PDF (optional, before seeding):

```bash
npm run scrape:kemsa          # download + parse → data/kemsa/kemsa_product_list.json
npm run scrape:kemsa -- --skip-download   # re-parse cached PDF only
```

Verify the full catalog (Python audit suite):

```bash
pip install -r scripts/catalog_audit/requirements.txt
npm run audit:catalog                  # export DB + run all checks
npm run audit:catalog -- --skip-export # use existing catalog-full-export.json
```

Reports: `data/audit-reports/catalog-audit-latest.md`

## Schema

### `Medicine`

Core catalog row (KEML formulation or hybrid/non-pharm entry).

- `itemType`: `MEDICINE` | `NON_PHARM`
- `category`: therapeutic grouping from hybrid catalog

### `MedicineAlias`

Maps supplier/brand strings → a catalog row.

| Field | Meaning |
|-------|---------|
| `source` | `KEML`, `BRAND_SEED`, `HYBRID`, `USER_CONFIRMED`, `IMPORT_LEARNED` |
| `status` | `ACTIVE`, `PENDING`, `REVOKED` |
| `tenantId` | Facility that taught the alias (null = global seed) |

Only **ACTIVE** aliases participate in search and bulk matching.

### `CatalogAliasProposal`

When a learned supplier name would conflict with an existing alias on a **different** medicine, a proposal is queued for platform review instead of being applied silently.

## Bulk import learning loop

1. Staff import a delivery list → `bulkMatchCatalog` scores each line.
2. Staff confirm or override matches in the review grid.
3. On successful receive, non-HIGH lines teach a new alias (`IMPORT_LEARNED`).
4. Next import of the same supplier label auto-matches.

Toast example: `Received 13 batches · learned 4 supplier names for future imports`

## Matching rules

Matching logic lives in `src/lib/catalog-match.ts`:

- Requires **generic name alignment**
- Enforces **form compatibility** (tablet vs liquid vs injection vs consumable)
- Enforces **strength compatibility** when strengths are present
- Confidence: HIGH ≥ 90, LOW ≥ 45

## Admin review

Platform admins: **`/admin/catalog`**

- Approve / reject **pending proposals** (conflicts)
- **Revoke** bad learned aliases
- View catalog stats (items, aliases, non-pharm count)

## Adding new reference sources

1. Add JSON/CSV under `data/` or `docs/`
2. Create `prisma/seed-<source>.ts` using `scoreCatalogMatch` for KEML alignment
3. Set `MedicineAlias.source` appropriately
4. Register the script in `prisma/seed-catalog-all.ts`

**Do not** scrape logged-in supplier portals without legal review. Prefer:

- KEML / PPB published lists
- KEMSA / MEDS public catalogs
- Your hybrid JSON + real delivery notes (import learning)

## Future sources (planned hooks)

| Source | Status |
|--------|--------|
| KEML 2023 | ✅ Seeded |
| Brand alias index | ✅ Seeded |
| Hybrid facility catalog | ✅ Seeded |
| KEMSA public product list | ✅ `npm run scrape:kemsa` then `db:seed-kemsa` |
| PPB product register | 🔲 Manual / licensed export |
| Supplier scrape | ❌ Not recommended without ToS review |
