# Changelog

All notable changes to **AfyaSmart-Stock** from the first commit through production deployment.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are grouped by development phase and date.

---

## [Unreleased]

### Added
- `npm run db:neon:seed-kemsa` — seeds KEMSA aliases against Neon only (avoids `.env.local` pointing at localhost).
- `.gitignore` entries for generated audit artifacts (`data/catalog-full-export.json`, `data/audit-reports/`).

### Operations (production, not yet in git)
- KEMSA catalog seeded on Neon production (~1,697 aliases, 442 non-pharm items, 838 medicine enrichments).

---

## [0.7.0] — 2026-06-14 — Catalog pipeline, bulk receive, medicine vs non-pharm reports

### Added
- **Hybrid + KEMSA catalog pipeline**
  - Shared fuzzy matcher (`catalog-match.ts`) for KEML, hybrid, and KEMSA product names.
  - KEMSA parser and scraped product list (`data/kemsa/kemsa_product_list.json`).
  - Extended hybrid catalog (`docs/extended_hybrid_catalog.json`) — Good Morning cough syrup, diclofenac, erythromycin, indomethacin, and 71 KEMSA-unmatched pharm products.
  - Expanded brand aliases (`data/alias_names.json`).
  - Seed scripts: cleanup polluted aliases, hybrid catalog, KEMSA, full catalog orchestration, Neon refresh helper.
  - Python catalog audit suite (`scripts/catalog_audit/`) — 8 checks plus KEMSA reconciliation.
  - Admin catalog UI at `/admin/catalog`.
- **Bulk delivery import** (`/receive`)
  - CSV and native Excel upload with review grid.
  - Pasted and scanned printed delivery lists.
  - KEML fuzzy matching via `bulkMatchCatalog` server action.
  - Transactional `receiveBulkInventory` bulk insert.
- **Medicine vs non-pharm reporting**
  - `itemType` snapshotted on each sale line at dispense time.
  - Sales report, stock report, sales dashboard, and CSV export split by medicine vs non-pharmaceutical items.
  - Backfill script for existing sale lines (`db:backfill-sale-line-item-type`).
- **Search & offline**
  - `itemType` wired through catalog search, offline cache, and POS non-pharm badge.

### Fixed
- Production build: removed unused import in reports module.
- Production build: default `itemType` on offline catalog mapping.

---

## [0.6.0] — 2026-06-13 — PWA reliability and offline POS polish

### Added
- Bulk-seed offline stock cache when POS opens online.
- Preload KEML catalog on POS mount for offline search.
- Background sync registration when catalog is stale.

### Fixed
- Roll back offline stock when sync fails or queue entry expires (24 h).
- Installed PWA opens at dashboard; POS shell precached.
- Service worker disabled in development to protect Next.js hot reload.

---

## [0.5.0] — 2026-06-11 — Offline-first PWA

### Added
- **Progressive Web App**
  - Web app manifest, icons, and install prompt.
  - Service worker with versioned cache key for clean release rollovers.
  - Dedicated offline fallback page (`/offline`).
- **IndexedDB offline data layer**
  - Cached KEML catalog with prefix search.
  - Tenant stock cache with FEFO batch ordering.
  - Pending dispense queue with background sync.
- **Offline POS workflow**
  - Offline catalog lookup and batch picker.
  - Client-side FEFO allocation and local receipt generation.
  - Sync API (`POST /api/offline/sync`) with server-authoritative conflict resolution.
  - Sync status badge in app shell.
- Unit tests for offline dispense logic.
- PWA architecture documented in `DOCUMENTATION.md` §18.

### Fixed
- Service worker asset caching and stale-while-revalidate for `/_next/static/*`.
- Static `offline.html` fallback instead of dynamic Next.js route.

---

## [0.4.0] — 2026-06-11 — Security, validation, and operational hardening

### Added
- **Security**
  - HTTP security headers: CSP, HSTS, X-Frame-Options, nosniff, permissions policy.
  - Sliding-window login rate limiter.
  - Session version field — password reset signs out all devices; JWT TTL reduced to 24 h.
  - Zod validation on dispense and receive inputs; passwords require letter + number.
  - Self-service password change at `/settings/password`.
  - Force password change on first sign-in for admin-assigned credentials.
  - `CONFIRM_DATA_LOSS=1` guard before destructive Neon setup.
  - AppError excluded from Sentry; unexpected errors sanitized before reaching clients.
- **Data integrity**
  - Non-negative stock CHECK constraints in PostgreSQL.
  - Atomic correction decrement.
  - Retry dispense/correction transactions on transient Prisma conflicts (P2034/P2028).
- **UX & accessibility**
  - Route error boundary, custom 404, loading skeletons on all routes.
  - Skip link, drawer focus trap (Escape), inline login errors.
  - Form labels and client-side validation on admin, team, and correction forms.
  - POS cart persisted in `sessionStorage` (survives refresh).
  - CSV export for stock and sales reports with formula-injection guard.
- **Testing & docs**
  - Vitest toolchain.
  - Unit tests for RBAC, stock units, and cart store.
  - Security and product audit report (`AUDIT_REPORT.md`).
  - Sentry build vars and contact email documented in `.env.example`.
- **Database**
  - `db:fix-warfarin` script to repair KEML typo in existing databases.
  - pg pool limits/timeouts; pool cached on `globalThis` in production.

### Changed
- Tenant isolation hardened: `findUnique` / `update` / `delete` scoped via extended where-unique.
- Unknown routes denied by default; `/settings` redirects to `/settings/team`.
- `addTeamMember` no longer overwrites existing users' passwords across facilities.

### Fixed
- "Ww Warfarin" typo corrected across KEML data files.

---

## [0.3.0] — 2026-06-03 — Public landing page and PWA foundation

### Added
- Public marketing landing page at `/`; dashboard moved to `/dashboard`.
- PWA install support: manifest, icons, service worker registration.

---

## [0.2.1] — 2026-05-27 — Production dispense fixes and branding

### Fixed
- Dispense receipt load: `findFirst` instead of `findUnique` under tenant scope.
- Production dispense failing inside tenant-scoped transactions.

### Changed
- Favicon replaced with AfyaSmart logo.

---

## [0.2.0] — 2026-05-26 — Multi-tenant isolation, auth, and IAM

### Added
- **Multi-tenancy**
  - Shared-database isolation with `tenantId` on stock and sales.
  - Prisma tenant extension; multitenant backfill script (Neon-safe chunking).
- **Authentication & IAM**
  - Login page with JWT session cookie.
  - Platform super-admin console (`/admin`) — list facilities, usage, create facilities, reset owner passwords.
  - Facility team management (`/settings/team`) — owner adds up to 3 staff (deputy + dispensers), role assignment, password reset.
  - RBAC: platform admin, owner, deputy, dispenser permissions.
  - Show/hide password toggle on login and password fields.
  - Horizon C password dialogs and multi-facility session switching.
- **Stock units**
  - Explicit counting units (tablet, box, bottle, etc.) across receive, POS, and reports.
- **POS search**
  - Stock-aware catalog search — in-stock formulations highlighted per facility.
- **Reports**
  - Stock insights and printable facility reports.

### Fixed
- Mobile layout with collapsible navigation drawer.
- Neon transaction timeout in multitenant backfill script.

### Changed
- Multi-tenant auth, stock units, and Neon setup documented in `DOCUMENTATION.md`.

---

## [0.1.0] — 2026-05-23 — MVP launch

### Added
- **AfyaSmart-Stock pharmacy POS MVP**
  - KEML 2023 medicine catalog (~1,567 medicines seeded).
  - Brand alias search (~3,654 aliases — Panadol, Septrin, Coartem, etc.).
  - **Receive stock** — search catalog, enter batch, quantity, expiry, costs.
  - **FEFO dispense** — POS cart, transactional stock deduction, priced sale log, printable receipt.
  - **Dashboard** — today's metrics, expiry alerts, low stock.
  - **Sales history** and basic insights.
  - Next.js App Router, Prisma + PostgreSQL, Tailwind UI.
  - Seed scripts for KEML, aliases, sample stock, and demo tenants.

---

## Production deployment summary

| Component | Status |
|-----------|--------|
| Vercel (app) | Deployed from `main` |
| Neon (database) | Schema pushed; tenants and auth seeded |
| KEML + brand aliases | Seeded on production |
| Hybrid catalog | Seeded on production (~692 aliases) |
| KEMSA catalog | Seeded on production (~1,697 aliases) |
| Sale line `itemType` backfill | Complete on production |

**Stack:** Next.js · Prisma · PostgreSQL (Neon) · Vercel · Sentry · Vitest

---

## Version index

| Version | Date | Theme |
|---------|------|-------|
| 0.1.0 | 2026-05-23 | MVP — KEML catalog, receive, FEFO POS |
| 0.2.0 | 2026-05-26 | Multi-tenant + login + IAM + stock units |
| 0.2.1 | 2026-05-27 | Production dispense fixes + branding |
| 0.3.0 | 2026-06-03 | Landing page + PWA install |
| 0.4.0 | 2026-06-11 | Security hardening + validation + CSV export |
| 0.5.0 | 2026-06-11 | Full offline PWA data layer |
| 0.6.0 | 2026-06-13 | PWA reliability and offline POS polish |
| 0.7.0 | 2026-06-14 | Bulk receive + catalog pipeline + itemType reports |

[Unreleased]: https://github.com/lewisnakhungu/cursor/compare/main...HEAD
[0.7.0]: https://github.com/lewisnakhungu/cursor/commits/main
