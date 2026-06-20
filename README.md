# AfyaStock

Multi-tenant pharmacy POS and stock management for Kenyan health facilities — KEML catalog, FEFO dispense, offline PWA, and facility reports.

**Live:** [afyastock.com](https://afyastock.com) · **Stack:** Next.js · Prisma · PostgreSQL (Neon) · Vercel

## Features

- KEML + KEMSA + brand-alias catalog search (medicine and non-pharm items)
- Multi-facility tenancy with role-based access (platform admin, owner, deputy, dispenser)
- Receive stock, FEFO dispense, sales audit, printable reports
- Offline-capable PWA for connectivity blackouts
- Bulk delivery import (CSV / Excel)

## Documentation

| Doc | Description |
|-----|-------------|
| [`docs/DOCUMENTATION.md`](./docs/DOCUMENTATION.md) | Master reference — everything built |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | FEFO, multi-tenancy, auth, transactions |
| [`docs/FRONTEND.md`](./docs/FRONTEND.md) | UI, routes, components |
| [`docs/ACHIEVEMENTS.md`](./docs/ACHIEVEMENTS.md) | Executive summary |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release history |

More guides: [`docs/catalog-ingestion.md`](./docs/catalog-ingestion.md) · [`docs/bulk-delivery-import.md`](./docs/bulk-delivery-import.md)

## Quick start

```bash
cp .env.example .env
cp .env.example .env.local
# .env.local → local DATABASE_URL + AUTH_SECRET (min 16 chars)
# .env → Neon / Sentry (optional)

npm install
npx prisma db push
npm run db:seed
npm run db:seed-aliases
npm run db:seed-tenants
npm run db:seed-auth
npm run db:seed-stock
npm run dev
```

Open http://localhost:3000/login

| Account | Email | Password |
|---------|--------|----------|
| Super user | `admin@afyasmart.local` | `ChangeMeAdmin1!` |
| Facility owner | `owner@default.local` | `ChangeMeOwner1!` |

## Deploy (Vercel + Neon)

1. Set env: `DATABASE_URL` (Neon pooled), **`AUTH_SECRET`** (required), optional Sentry.
2. One-time against Neon:

   ```bash
   export DATABASE_URL="<neon-pooled-url>"
   npx prisma db push --accept-data-loss
   npm run db:seed && npm run db:seed-aliases
   npm run db:seed-tenants && npm run db:seed-auth
   ```

## Routes

| URL | Purpose |
|-----|---------|
| `/login` | Sign in |
| `/admin` | Platform admin (facilities, owner password reset) |
| `/dashboard` | Dashboard (expiry, stock) |
| `/receive` | Receive inventory |
| `/pos` | Dispense — stock-aware search |
| `/sales` | Sales & audit corrections |
| `/insights` | Restock & sell-through |
| `/reports` | Printable reports |
| `/settings/team` | Owner: staff accounts (max 3) |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:push` | Apply schema |
| `npm run db:seed` | KEML catalog |
| `npm run db:seed-aliases` | Brand aliases |
| `npm run db:seed-tenants` | Demo facilities |
| `npm run db:seed-auth` | Super user + demo owners |
| `npm run db:seed-stock` | Sample stock |
| `npm run db:neon:seed-kemsa` | KEMSA aliases on Neon (production) |

## Key paths

```
prisma/schema.prisma
src/lib/auth/          # session, permissions, guards
src/lib/prisma-tenant.ts
src/lib/actions/
src/middleware.ts
docs/                  # architecture & guides
config/                # vitest and other tool configs
```

## Standards

Tenant-scoped stock/sales, auth on server actions, Prisma transactions for dispense, Sentry on errors — see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).
