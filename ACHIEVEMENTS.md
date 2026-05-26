# AfyaSmart-Stock — Achievements Summary

Executive record of everything delivered in this project.

---

## Product vision

A **Kenya pharmacy POS** that:

- Uses **KEML** for fast, accurate drug lookup (including brand aliases).
- Keeps **real inventory** (batches, expiry, FEFO) separate from the national formulary.
- Supports **multiple facilities** on one platform with strict data isolation.
- Gives each facility **role-based staff accounts** (owner, deputy, dispensers).
- Dispenses safely under **database transactions** with full audit trails.

**Implemented in production-ready MVP form.**

---

## Data layer

| Achievement | Detail |
|-------------|--------|
| KEML 2023 ingested | 1,576 JSON rows → 1,567 `Medicine` records |
| Searchable catalog | 1,459 non-stub formulations |
| Brand aliases | ~3,654 alias rows from `alias_names.json` |
| Multi-tenant schema | `Tenant`, `User`, `Membership`, `tenantId` on stock/sales |
| Stock units | `StockUnit` enum + pack size on batches and sale lines |
| Neon production | Schema pushed; auth users seeded |

---

## Application features

### Authentication & IAM

- Login at `/login` with HTTP-only JWT session (`AUTH_SECRET`)
- **Super user** — `/admin`: manage facilities, view 30-day usage, reset **owner** passwords only
- **Facility owner** — `/settings/team`: up to **3** staff (deputy + dispensers), role assignment, staff password reset
- **RBAC** — middleware + server actions; dispensers see POS only; deputy/owner see receive & reports
- Show/hide password on login and password fields

### Multi-tenancy

- Shared PostgreSQL + `tenantId` isolation on `StockBatch`, `Sale`, `SaleLine`
- Global KEML catalog; per-facility operational data
- Prisma client extension auto-scopes tenant queries
- Demo facilities: default, Kakamega, Kisumu, Nairobi, Mombasa

### Operations dashboard (`/`)

- Expiry alerts, low stock, FEFO-ordered stock table

### Receive (`/receive`)

- KEML search, supplier, batch, **stock unit** (tablet/box/etc.), optional pack size, costs, retail price

### Point of sale (`/pos`)

- **Stock-aware search** — in-stock badges per formulation when typing generics (e.g. paracetamol)
- FEFO batch picker, priced cart, thermal receipt
- Serializable dispense transaction

### Sales (`/sales`)

- Today’s revenue, top drugs, audit corrections with stock restore

### Insights (`/insights`)

- Receive history, sell-through %, weekly trends, slow movers

### Reports (`/reports`)

- Printable weekly/monthly sales + stock reports

---

## Engineering

| Area | Achievement |
|------|-------------|
| Stack | Next.js 14, TypeScript, Tailwind, Shadcn, Prisma 7, PostgreSQL, Neon |
| Auth | bcryptjs + jose sessions, middleware route guards |
| Multi-tenant | `getTenantPrisma`, session-based `tenantId` |
| FEFO | `FOR UPDATE` + expiry ordering + tenant filter in dispense SQL |
| Observability | Sentry with action + tenant tags |
| Build | `npm run build` passes |
| Docs | `DOCUMENTATION.md`, `ARCHITECTURE.md`, `FRONTEND.md`, this file |

---

## Default credentials (change in production)

| Role | Email | Password |
|------|--------|----------|
| Super user | `admin@afyasmart.local` | `ChangeMeAdmin1!` |
| Owner (default facility) | `owner@default.local` | `ChangeMeOwner1!` |

---

## Timeline (build order)

1. Architecture & KEML seed  
2. Receive, FEFO POS, dashboard, receipt  
3. Sales, pricing, supplier, audit  
4. Insights & printable reports  
5. Stock counting units  
6. Multi-tenant schema + isolation  
7. POS stock-aware catalog search  
8. Auth, super admin, facility team IAM, Neon deploy  

---

## Full documentation

See [`DOCUMENTATION.md`](./DOCUMENTATION.md).
