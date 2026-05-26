# AfyaSmart-Stock POS

Pharmacy MVP for Kenya: **KEML catalog autocomplete**, **brand alias search**, **FEFO stock**, **priced dispense**, **sales tracking**, and **audit corrections**.

**This directory is the project root** (git + Vercel). All commands run from here.

## Documentation

| Doc | Description |
|-----|-------------|
| [`DOCUMENTATION.md`](./DOCUMENTATION.md) | **Master reference** — everything built |
| [`ACHIEVEMENTS.md`](./ACHIEVEMENTS.md) | Executive summary of deliverables |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | FEFO, transactions, domain model |
| [`FRONTEND.md`](./FRONTEND.md) | UI components, routes, design decisions |

## Quick start

```bash
cp .env.example .env
cp .env.example .env.local
# Edit .env.local → local DATABASE_URL | .env → Neon/Sentry (see .env.example)

npm install
npx prisma db push
npm run db:seed
npm run db:seed-stock
npm run db:seed-aliases
npm run dev
```

## Deploy (Vercel + Neon)

1. Connect this repo; set **Root Directory** to `.` (this folder if the repo is only `afyasmart-app`, or `afyasmart-app` if the monorepo parent is checked out).
2. Add env: `DATABASE_URL` (Neon pooled), optional Sentry + `NEXT_PUBLIC_FACILITY_NAME`.
3. One-time from your machine against Neon:
   ```bash
   npx prisma db push
   npm run db:seed && npm run db:seed-aliases
   ```

## Routes

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Operations dashboard (expiry, FEFO stock) |
| http://localhost:3000/receive | Receive inventory (+ supplier) |
| http://localhost:3000/pos | Dispense (priced cart + receipt) |
| http://localhost:3000/sales | Today’s sales, top drugs, audit fixes |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:push` | Apply Prisma schema (uses active `DATABASE_URL`) |
| `npm run db:push:local` | Apply schema to **local** Postgres (`.env.local`) |
| `npm run db:seed` | Import KEML from `data/final_keml_2023.json` |
| `npm run db:seed-stock` | Sample stock (~95 common Kenya drugs) |
| `npm run db:seed-aliases` | Brands from `data/alias_names.json` |
| `npm run db:neon:setup` | Push schema + seed KEML + aliases on **Neon** (uses `.env` only) |
| `npm run db:generate` | Regenerate Prisma client |

## Key paths

```
data/                      # KEML + alias JSON (see data/README.md)
prisma/schema.prisma
prisma/seed.ts
prisma/seed-aliases.ts
src/lib/actions/
src/components/
```

## Standards

See [`.cursorrules`](./.cursorrules): Prisma transactions for stock, Sentry on server actions, TypeScript throughout.
