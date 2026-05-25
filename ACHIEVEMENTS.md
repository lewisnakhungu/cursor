# AfyaSmart-Stock — Achievements Summary

A concise record of everything delivered in this project to date.

---

## Product vision

Build a **Kenya pharmacy POS** that:

- Speeds up stock registers with **KEML autocomplete** (names + formulations).
- Keeps **real inventory** (batches, expiry, FEFO) separate from the national formulary list.
- Dispenses safely under **database transactions** with audit trails.

**That vision is implemented in MVP form.**

---

## Data layer

| Achievement | Detail |
|-------------|--------|
| KEML 2023 ingested | 1,576 JSON rows → 1,567 `Medicine` records |
| Searchable catalog | 1,459 non-stub formulations for POS/receive |
| Reference files preserved | CSV + JSON + index JSON at repo root |
| Sample stock | ~95 common Kenya drugs, ~219 batches with prices |
| Schema evolution | Supplier, pricing, sale totals, line status, audit notes |

---

## Application features

### Operations dashboard (`/`)

- KPI cards: active batches, expiring ≤90d, critical ≤30d, low stock
- Expiry risk queue (sorted by days left)
- Active stock table in **FEFO pull order**
- Amber alerts with CTA to dispense

### Receive inventory (`/receive`)

- KEML catalog search (shared component)
- **Supplier / vendor** field
- Batch number, quantity, expiry date
- Supplier cost & **retail sale price** (used at dispense)
- Step indicator UI + Sonner feedback

### Point of sale (`/pos`)

- Split layout: search | priced cart
- FEFO batch picker (“Use first”, expiry risk badges)
- Zustand cart with unit price × qty = line total
- **Complete dispense** → Serializable transaction
- Thermal receipt: **per-drug pricing + grand total**
- 80mm print stylesheet

### Sales & audit (`/sales`)

- **Today’s sales count** and **revenue (KES)**
- Units sold today
- **Top drugs** (today + last 7 days by units/revenue)
- Full list of today’s sales with line detail
- **Correct** dispensed lines (qty change or void)
- Mandatory audit reason; stock auto-adjusted

---

## Engineering

| Area | Achievement |
|------|-------------|
| Stack | Next.js 14, TypeScript, Tailwind, Shadcn, Prisma 7, PostgreSQL |
| Server actions | Typed `ActionResult`, Sentry on every action |
| FEFO | `FOR UPDATE` + expiry ordering + conditional decrement |
| UI shell | Persistent sidebar; pharmacy-themed design system |
| Build | `npm run build` passes |
| Docs | `DOCUMENTATION.md`, `ARCHITECTURE.md`, `FRONTEND.md`, this file |

---

## Commands cheat sheet

```bash
# from project root
npx prisma db push
npm run db:seed
npm run db:seed-stock
npm run dev
```

| URL | Page |
|-----|------|
| http://localhost:3000 | Dashboard |
| http://localhost:3000/receive | Receive stock |
| http://localhost:3000/pos | Dispense |
| http://localhost:3000/sales | Sales & audit |

---

## Timeline (build order)

1. Architecture & stack scaffold  
2. KEML seed + Prisma schema  
3. Server actions (catalog, receive, dispense)  
4. POS + receive + dashboard + receipt  
5. Pharmacy UI overhaul (shell, badges, FEFO UX)  
6. Kenya common stock seed  
7. Sales dashboard, pricing, supplier, audit corrections  

---

## Full documentation

See [`DOCUMENTATION.md`](./DOCUMENTATION.md) for the complete technical reference (same folder).
