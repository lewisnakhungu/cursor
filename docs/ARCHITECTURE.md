# AfyaSmart-Stock — MVP Architecture

## 1. Domain model: `Medicine` vs `StockBatch`

### `Medicine` (catalog / formulary reference)

Seeded from KEML (`final_keml_2023.json`). Represents a **dispensable product definition**, not on-hand stock.

| Field | Purpose |
|-------|---------|
| `id` | Surrogate UUID (stable app key) |
| `genericName` | Search + display (indexed, normalized for autocomplete) |
| `dosageForm` | e.g. Tablet, Injection |
| `strength` | Free-text strength/pack (parsed later if needed) |
| `searchKey` | Lowercased normalized string for fast `ILIKE`/trigram search |
| `kemlCode`, `levelOfUse`, `chapter` | Optional reference metadata (not used in FEFO) |
| `isStub` | `true` when form/strength are placeholders — **excluded from POS search** |

**Relationship:** One `Medicine` → many `StockBatch` rows (lots received over time).

```
Medicine (catalog)          StockBatch (operational)
─────────────────          ────────────────────────
id                    1──*  medicineId
genericName + form           batchNumber (optional)
strength                     quantityOnHand
                             expiryDate  ← drives FEFO
                             receivedAt
```

Pharmacist flow: **search `Medicine`** → pick formulation → see **available `StockBatch`** for that `medicineId` (qty > 0, not expired) → add line to cart with `batchId` + qty.

### `StockBatch`

Operational inventory per **tenant**. Created via `receiveInventory` or `db:seed-stock`, never from KEML seed.

| Field | Purpose |
|-------|---------|
| `tenantId` | FK → `Tenant` — isolation boundary |
| `medicineId` | FK → `Medicine` |
| `stockUnit` | How qty is counted (TABLET, BOX, …) |
| `unitsPerPack` | Optional inner count per box/strip |
| `batchNumber` | Supplier/lot label (nullable) |
| `supplierName` | Vendor (e.g. KEMSA) — set at receive |
| `quantityOnHand` | Int — mutable on dispense / audit correction |
| `expiryDate` | Required for FEFO |
| `supplierCost` | Optional Decimal — purchase cost |
| `retailSalePrice` | Optional Decimal — used as `unitPrice` at dispense |
| `receivedAt` | Audit + FEFO tie-breaker |

### `Sale` / `SaleLine` (dispense audit)

| Model | Role |
|-------|------|
| `Sale` | Header: `createdAt`, `totalAmount` (sum of active lines) |
| `SaleLine` | `medicineId`, `stockBatchId`, `quantity`, `unitPrice`, `lineTotal`, `status` (`ACTIVE` \| `VOIDED`), `correctionNote` |
| Snapshots | `genericName`, `dosageForm`, `strength` frozen at dispense |

Stock mutation happens on `StockBatch` inside the dispense transaction. **Audit corrections** (`correctSaleLine`) adjust stock and line totals after the fact.

### `correctSaleLine` (audit)

- Reduce quantity → return difference to batch.
- Increase quantity → deduct extra if stock allows.
- Quantity `0` → `VOIDED`, restore full qty to batch.
- Recalculate `Sale.totalAmount` from active lines only.

---

## 2. Checkout / dispense — Prisma transaction (FEFO)

### Goals

- No oversell under concurrent checkouts (health-tech integrity).
- Deduct from **nearest-expiring batches first** (FEFO).
- Atomic: stock update + sale log succeed or fail together.

### Algorithm (`dispenseMedicine`)

For each cart line `{ medicineId, quantity }` (cart may specify `stockBatchId` for manual pick, else auto-FEFO):

1. **`$transaction` with `Serializable` or `RepeatableRead`** (Postgres) — default Prisma interactive transaction with row-level locking via `UPDATE ... WHERE` on affected batches.

2. **Lock batches** for `medicineId`:
   ```sql
   SELECT * FROM "StockBatch"
   WHERE "medicineId" = $1 AND "quantityOnHand" > 0 AND "expiryDate" >= CURRENT_DATE
   ORDER BY "expiryDate" ASC, "receivedAt" ASC
   FOR UPDATE
   ```

3. **Allocate quantity** across rows until line qty satisfied; if sum available < requested → rollback entire transaction (`InsufficientStockError`).

4. **Decrement** each touched batch (`quantityOnHand -= allocated`).

5. **Insert** `Sale` + `SaleLine` with `unitPrice` (from batch retail), `lineTotal`, and name snapshots.

6. Set `Sale.totalAmount` from sum of line totals.

7. Return `{ saleId, lines, totalAmount }`.

### Race conditions

| Risk | Mitigation |
|------|------------|
| Two POS terminals deduct same batch | Transaction + `FOR UPDATE` on batch rows (via Prisma `$queryRaw` or sequential `update` with `where: { id, quantityOnHand: { gte: n } }` optimistic check) |
| Partial failure mid-cart | Single `$transaction` wrapping all lines |
| Expired stock dispensed | Filter `expiryDate >= today` in allocation query |

### Prisma sketch

```typescript
await prisma.$transaction(async (tx) => {
  const sale = await tx.sale.create({ data: { ... } });
  for (const item of cartItems) {
    const batches = await tx.stockBatch.findMany({
      where: { medicineId: item.medicineId, quantityOnHand: { gt: 0 }, expiryDate: { gte: new Date() } },
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
    });
    // allocate + update + create sale lines
  }
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
```

---

## 3. Server Actions (`lib/actions`)

| Action | Responsibility |
|--------|----------------|
| `searchCatalog(query)` | `Medicine` where `searchKey` contains normalized query, `isStub = false`, limit 20 |
| `getBatchesForMedicine(id)` | In-stock, non-expired batches (FEFO order) |
| `receiveInventory(batchData)` | Validate medicine exists; `stockBatch.create` (+ supplier, prices) |
| `getExpiringStock()` | Expiry alerts + active stock overview |
| `dispenseMedicine(cartItems)` | Transactional FEFO + priced `Sale` / `SaleLine` |
| `correctSaleLine(...)` | Post-dispense audit: adjust qty or void; restore stock |
| `getSalesDashboard()` | Today metrics, sales list, top drugs (today + 7d) |

All actions: `try/catch`, rethrow or return `{ error }`, never swallow exceptions without Sentry.

---

## 4. POS UI (`/pos`)

- **Zustand** `useCartStore`: `{ lines: CartLine[], addLine, removeLine, clear }`
- **Shadcn Command** combobox for catalog search (debounced server action)
- Batch picker dialog when multiple batches exist
- **Dispense** → `dispenseMedicine` → toast success / error

Keyboard-first: focus search on load, Enter to add, shortcuts documented in component.

---

## 5. Data pipeline

| Source | Target |
|--------|--------|
| `data/final_keml_2023.json` | `Medicine` via `prisma/seed.ts` |
| `data/alias_names.json` | `MedicineAlias` via `prisma/seed-aliases.ts` |
| `data/clean_index_names.json` | Legacy index (not seeded) |

Stub filter: `dosageForm === 'As per KEML listing'` OR `strength === 'As per clinical need'` → `isStub: true`, excluded from search.

---

## 6. Observability

- `@sentry/nextjs` — `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- `next.config` wrapped with `withSentryConfig`
- Server Actions: `Sentry.captureException(error)` in catch blocks

---

## 7. Multi-tenancy (shared DB + tenant key)

### Tenant boundary

| Model | `tenantId` |
|-------|------------|
| `Medicine`, `MedicineAlias` | No — shared KEML |
| `StockBatch`, `Sale`, `SaleLine` | Yes — required |

### Request flow

1. User signs in → session JWT contains `tenantId` + `role` (or `isPlatformAdmin`).
2. Server actions call `requireTenantContext(permission)` → `getTenantPrisma(tenantId)`.
3. Prisma extension merges `WHERE tenantId = …` on reads/writes for scoped models.
4. Dispense `$queryRaw` also filters `"tenantId"` explicitly.

### Platform admin

- `isPlatformAdmin` users have no `tenantId` on session.
- May only access `/admin` routes (middleware).
- Cross-tenant analytics use unscoped `prisma` in `admin.ts` actions.

### Concurrent facilities

Postgres MVCC; no cross-tenant row locks. Per-tenant FEFO dispense still uses Serializable transactions within one facility.

---

## 8. Authentication & IAM

### Session (`src/lib/auth/`)

- Cookie `afyasmart_session` — HS256 JWT signed with `AUTH_SECRET`
- `buildSessionForUser` — loads membership or platform admin flag

### Roles

| Role | Key permissions |
|------|-----------------|
| `OWNER` | Team management + full facility ops |
| `DEPUTY` | Receive, reports, insights, sales, dispense |
| `DISPENSER` | `dashboard.view`, `dispense.sale` only |

`MAX_FACILITY_STAFF = 3` (deputy + dispensers; owner separate).

### Password policy

- Min 8 characters (`validatePasswordPolicy`)
- Super user resets **owner** passwords only
- Owner resets **staff** passwords only

---

## 9. Stock counting units

- Enum `StockUnit` on `StockBatch` and `SaleLine` (snapshot at dispense)
- Optional `unitsPerPack` for boxes/strips
- `src/lib/stock-unit.ts` — formatting and cart/stock summaries

---

## 10. Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL (local or Neon pooled) |
| `AUTH_SECRET` | Session signing (min 16 chars) — **required** |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Optional telemetry |
| `SUPER_EMAIL` / `SUPER_PASSWORD` | Optional overrides for `db:seed-auth` |

Prisma: `.env.local` loads first, then `.env`.
