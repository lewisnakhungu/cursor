# AfyaSmart-Stock POS

Pharmacy system for Kenya: **KEML catalog**, **multi-facility stock**, **role-based login**, **FEFO dispense**, **insights & reports**.

**Project root** (git + Vercel). Run all commands from this folder.

## Documentation

| Doc | Description |
|-----|-------------|
| [`DOCUMENTATION.md`](./DOCUMENTATION.md) | **Master reference** — everything built |
| [`ACHIEVEMENTS.md`](./ACHIEVEMENTS.md) | Executive summary |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | FEFO, multi-tenancy, auth |
| [`FRONTEND.md`](./FRONTEND.md) | UI, routes, components |

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
| `/` | Dashboard (expiry, stock) |
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
| `npm run db:migrate-multitenant` | Backfill tenantId on existing rows |
| `npm run db:neon:multitenant` | Neon brownfield tenant setup |

## Key paths

```
prisma/schema.prisma
src/lib/auth/          # session, permissions, guards
src/lib/prisma-tenant.ts
src/lib/actions/
src/middleware.ts
```

## Standards

See [`.cursorrules`](./.cursorrules): tenant-scoped stock/sales, auth on server actions, Prisma transactions for dispense, Sentry on errors.
