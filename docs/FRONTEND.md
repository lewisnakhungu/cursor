# AfyaSmart-Stock — Frontend Documentation

Step-by-step record of how the Next.js 14 frontend was built, wired, and extended through Phase 4.

**Related:** [`DOCUMENTATION.md`](./DOCUMENTATION.md) (full project), [`ARCHITECTURE.md`](./ARCHITECTURE.md) (domain/FEFO design)

---

## 1. Foundation (Phase 1)

### 1.1 Scaffold

```bash
npx create-next-app@14 afyasmart-app \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm
```

- **App Router** under `src/app/`
- Path alias `@/*` → `src/*`
- Tailwind 3 + PostCSS

### 1.2 Root layout

**File:** `src/app/layout.tsx`

| Step | Detail |
|------|--------|
| Fonts | Local Geist VF / Mono via `next/font/local` |
| Global styles | `src/app/globals.css` — Shadcn CSS variables (HSL tokens) |
| Toasts | `<Toaster />` from `@/components/ui/sonner` (Sonner) |
| Metadata | Title/description for AfyaSmart-Stock |

### 1.3 Sentry (client surface)

| File | Role |
|------|------|
| `sentry.client.config.ts` | Browser SDK init (`NEXT_PUBLIC_SENTRY_DSN`) |
| `src/instrumentation.ts` | Server and Edge SDK init |
| `src/instrumentation.ts` | Loads server/edge configs per runtime |
| `src/app/global-error.tsx` | `Sentry.captureException` on React root errors |
| `next.config.mjs` | `withSentryConfig` wrapper |

Server Actions report errors via `runAction()` in `src/lib/actions/utils.ts` — not duplicated in every page.

### 1.4 Styling system

**`tailwind.config.ts`**

- Extended theme: `background`, `foreground`, `primary`, `muted`, `destructive`, `border`, `ring`, etc. from CSS variables
- Content paths: `src/app`, `src/components`

**`src/app/globals.css`**

- `@layer base` with `:root` HSL tokens (green primary for health UI)
- **Thermal print block** (Phase 4): `.thermal-receipt` (80mm width) + `@media print` rules hiding non-receipt content

---

## 2. UI kit (Shadcn)

### 2.1 Init

```bash
npx shadcn@latest init -y -d
npx shadcn@latest add button input table dialog command sonner -y
```

**Config:** `components.json` — style `base-nova`, RSC enabled, aliases `@/components/ui`, `@/lib/utils`.

**Utility:** `src/lib/utils.ts` — `cn()` via `clsx` + `tailwind-merge`.

### 2.2 Components installed

| Component | Path | Used on |
|-----------|------|---------|
| `button` | `src/components/ui/button.tsx` | All routes |
| `input` | `src/components/ui/input.tsx` | Receive, POS cart qty |
| `table` | `src/components/ui/table.tsx` | Dashboard, POS cart |
| `dialog` | `src/components/ui/dialog.tsx` | POS batch picker, receipt |
| `command` | `src/components/ui/command.tsx` | Catalog search (cmdk) |
| `sonner` | `src/components/ui/sonner.tsx` | Global toasts |
| `input-group` | `src/components/ui/input-group.tsx` | Command input chrome |
| `textarea` | `src/components/ui/textarea.tsx` | (available, unused in MVP) |

### 2.3 Custom UI

| Component | Path | Purpose |
|-----------|------|---------|
| `alert` | `src/components/ui/alert.tsx` | Expiry warning banner on dashboard (`variant="warning"`) |

### 2.4 Sonner fix (dev cache issue)

Original Shadcn Sonner used `next-themes` (`useTheme`). That caused missing webpack vendor chunks after hot reload.

**Fix:** `sonner.tsx` hardcodes `theme="light"` and removes `next-themes` import.

---

## 3. Client state (Zustand)

**File:** `src/stores/cart-store.ts`

| Field / method | Behavior |
|----------------|----------|
| `lines` | Active dispense cart |
| `addLine` | Merge by `stockBatchId`; cap qty at `maxQuantity` |
| `removeLine` | By line `id` |
| `updateQuantity` | Clamp 1…`maxQuantity` |
| `clear` | After successful dispense |

**Cart line shape:** `medicineId`, `stockBatchId`, display names, `batchNumber`, `expiryDate`, `quantity`, `maxQuantity`.

Only **`/pos`** uses the cart store. Receive and dashboard are stateless forms / server-rendered data.

---

## 4. Shared catalog search

**File:** `src/components/catalog/medicine-catalog-search.tsx`

Reusable client combobox used on **Receive** and **POS**.

| Step | Implementation |
|------|----------------|
| Input | Shadcn `Command` + `CommandInput` (`shouldFilter={false}`) |
| Debounce | Implicit via user typing; min **2** characters |
| Data | `searchCatalog(query)` server action |
| Select | `onSelect(medicine)` callback to parent |
| A11y | Escape clears results; `disabled` prop when submitting |

---

## 5. Routes and pages

### 5.1 Route map

| Route | File | Rendering | Description |
|-------|------|-----------|-------------|
| `/` | `src/app/page.tsx` | Server shell + async child | Dashboard hub |
| `/receive` | `src/app/receive/page.tsx` | Server shell + client form | Inventory intake |
| `/pos` | `src/app/pos/page.tsx` | Client `PosTerminal` | Point of sale |

### 5.2 Home / dashboard (`/`)

**Files:**

- `src/app/page.tsx` — layout, nav buttons (Receive, POS)
- `src/components/dashboard/stock-dashboard.tsx` — **async Server Component**

**Steps:**

1. Call `getExpiringStock()` directly in the server component (no client fetch).
2. If `hasExpiryWarning`, render Shadcn `Alert` (warning variant) with count of batches expiring ≤90 days.
3. Table **Expiry risk** — rows sorted by `daysUntilExpiry` ascending; risk labels Critical / High / Watch.
4. Table **Active stock (FEFO order)** — all batches with `quantityOnHand > 0`, ordered by expiry then received; columns: medicine, batch tag, units, expiry, FEFO rank (#1, #2…), flags (expiring soon, low stock ≤10).

### 5.3 Receive inventory (`/receive`)

**Files:**

- `src/app/receive/page.tsx` — header + nav
- `src/components/receive/receive-intake-form.tsx` — full intake UX

**Steps:**

1. **Column 1:** `MedicineCatalogSearch` → sets `selected` `CatalogMedicine`.
2. **Column 2:** Form mapped to `ReceiveInventoryInput`:
   - Batch number (optional string)
   - Quantity on hand (integer, bulk/box counts)
   - Expiry date (`type="date"`)
   - Supplier cost (optional float, KES)
   - Retail sale price (optional float, KES)
3. Submit → `receiveInventory()` inside `useTransition` (`isSubmitting`).
4. Disable all fields until a medicine is selected.
5. Outcome → `toast.success` / `toast.error`; reset form on success.

### 5.4 POS (`/pos`)

**Files:**

- `src/app/pos/page.tsx` — renders `<PosTerminal />`
- `src/components/pos/pos-terminal.tsx` — main client UI
- `src/components/pos/dispense-receipt.tsx` — post-sale receipt modal + print

**User flow (implementation order):**

```
Search catalog → Select medicine → Load batches (FEFO list)
    → Pick batch + qty → Add to Zustand cart
    → Dispense → Server transaction → Receipt modal → Print
```

| UI block | Details |
|----------|---------|
| Header | Links to Dashboard / Receive; **Dispense** button |
| Search | `MedicineCatalogSearch` → `getBatchesForMedicine` |
| Batch dialog | Lists batches earliest-expiry first; qty input; click row to add |
| Cart table | Editable qty, remove line; disabled while dispensing |
| Dispense | `dispenseMedicine(cart lines)` → `useTransition` |
| Receipt | On success: `clearCart()`, open `DispenseReceipt` with `DispenseResult` |

### 5.5 Thermal receipt

**File:** `src/components/pos/dispense-receipt.tsx`

| Step | Detail |
|------|--------|
| Trigger | `receiptOpen` + `receipt` state after successful dispense |
| Preview | `.thermal-receipt` div (80mm, monospace) inside dialog |
| Print | `window.print()` — separate `.thermal-receipt-print` node for `@media print` |
| Content | `NEXT_PUBLIC_FACILITY_NAME`, sale id, timestamp, each line: generic name, form, strength, batch, qty |
| Footer | `*** DISPENSED — VERIFY BEFORE USE ***` |

Print CSS lives in `src/app/globals.css` (hides rest of page, 80mm page size).

---

## 6. Server Action integration (frontend contract)

Pages do **not** call Prisma directly. All data goes through `src/lib/actions/*` with `ActionResult<T>`:

```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
```

| Action | Called from |
|--------|-------------|
| `searchCatalog` | `MedicineCatalogSearch` |
| `getBatchesForMedicine` | `PosTerminal` batch dialog |
| `receiveInventory` | `ReceiveIntakeForm` |
| `getExpiringStock` | `StockDashboard` (server) |
| `dispenseMedicine` | `PosTerminal` — returns `{ saleId, createdAt, lines[] }` for receipt |

**Loading patterns:**

- `useTransition` → `isSearching`, `isSubmitting`, `isDispensing`, `isLoadingBatches`
- Buttons/inputs `disabled` while pending

---

## 7. Phase timeline (frontend-only)

| Phase | Frontend deliverables |
|-------|----------------------|
| **1** | Next.js + Tailwind + layout + Sentry + globals |
| **2** | (Backend seed only — no new pages) |
| **3** | Server actions (consumed by UI in Phase 4) |
| **4a** | Initial `/pos`: inline Command search, cart table, batch dialog, dispense toast |
| **4b** | `/receive` intake form + shared `MedicineCatalogSearch` |
| **4c** | `/` dashboard: `StockDashboard` + alert + FEFO tables |
| **4d** | `DispenseReceipt` + thermal `@media print` CSS |
| **Fix** | Clear `.next`, remove duplicate root `app/`, Sonner without `next-themes` |

---

## 8. File tree (frontend)

```
src/
├── app/
│   ├── layout.tsx          # Root layout, Toaster
│   ├── page.tsx            # Dashboard home
│   ├── globals.css         # Theme tokens + thermal print
│   ├── global-error.tsx    # Sentry boundary
│   ├── pos/page.tsx
│   └── receive/page.tsx
├── components/
│   ├── catalog/
│   │   └── medicine-catalog-search.tsx
│   ├── dashboard/
│   │   └── stock-dashboard.tsx      # Server Component
│   ├── pos/
│   │   ├── pos-terminal.tsx         # Client
│   │   └── dispense-receipt.tsx     # Client
│   ├── receive/
│   │   └── receive-intake-form.tsx  # Client
│   └── ui/                          # Shadcn primitives
├── stores/
│   └── cart-store.ts                # Zustand
└── lib/
    ├── types.ts                     # Shared TS types for UI
    └── actions/                     # Server Actions (called from client)
```

---

## 9. Local development

```bash
# from project root (this folder)
npm run dev
```

| URL | Page |
|-----|------|
| http://localhost:3000 | Dashboard |
| http://localhost:3000/receive | Receive stock |
| http://localhost:3000/pos | POS + receipt |
| http://localhost:3000/sales | Sales & audit |

### If you see `Cannot find module './894.js'` or 500 on `/pos`

Stale `.next` cache after code changes while dev server is running:

```bash
# Stop dev server (Ctrl+C), then:
rm -rf .next
npm run dev
```

Do **not** keep both a root `app/` folder and `src/app/` — only `src/app/` is used.

---

## 10. Environment (frontend)

| Variable | Affects |
|----------|---------|
| `NEXT_PUBLIC_SENTRY_DSN` | Client error reporting |
| `NEXT_PUBLIC_FACILITY_NAME` | Thermal receipt header (default: `AfyaSmart Facility`) |

---

## 11. Pharmacy UI research → implementation (2026)

Industry patterns applied from retail/pharmacy POS case studies:

| Principle | Implementation |
|-----------|----------------|
| **Touch-first, large targets** | `min-h-11` inputs/buttons, sidebar nav tiles |
| **Single-app navigation** | Fixed `AppShell` sidebar (Dashboard / Receive / Dispense / Sales) |
| **FEFO visibility** | `Use first` badge, emerald highlight on earliest batch |
| **Expiry risk hierarchy** | Critical ≤30d, High ≤60d, Watch ≤90d — color badges + KPI cards |
| **Reduced cognitive load** | Step badges on Receive; split POS (search \| cart) |
| **Context-aware alerts** | Dashboard stat strip + amber banner with CTA to POS |
| **Keyboard speed** | Search autofocus, Esc hint, large command list rows |
| **Healthcare trust aesthetic** | Teal-green primary, soft shell background, card panels |

**New components:** `app-shell.tsx`, `badge.tsx`, `stat-card.tsx`, `batch-picker.tsx`, `lib/ui/stock-status.ts`

---

## 12. Sales & audit (`/sales`)

| Feature | Implementation |
|---------|----------------|
| Today KPIs | `getSalesDashboard()` — sales count, revenue, units, voided lines |
| Top drugs | Today + 7-day tables (units & KES revenue) |
| Today’s sales list | Per-sale breakdown with line prices |
| Audit correction | Dialog → `correctSaleLine()` — qty edit or void + reason |
| Nav | Sidebar link **Sales** |

## 13. Pricing & receipt

- Dispense captures `unitPrice` from `StockBatch.retailSalePrice`.
- Cart shows `qty × unit = line` and cart total.
- Receipt: per-line breakdown + **TOTAL KES**.
- `src/lib/money.ts` — `formatKes()`.

## 14. Receive — supplier

`supplierName` field on receive form → `StockBatch.supplierName`.

## 16. Authentication UI (2026)

| Feature | Implementation |
|---------|----------------|
| Login | `/login` — `LoginForm` + `PasswordInput` show/hide |
| Middleware | `src/middleware.ts` — auth redirect + RBAC per path |
| App shell | `AppShell` (server) → `AppShellClient` (session nav + sign out) |
| Nav filtering | `canAccessNav` — role-based sidebar items |
| Admin | `/admin` — `AdminConsole` (facilities table, create, owner password reset) |
| Team | `/settings/team` — `TeamSettings` (add deputy/dispenser, max 3) |

**Server pages** wrap content in `AppShell`; client dashboards no longer import shell directly (avoids `next/headers` in client bundles).

---

## 17. Stock-aware POS search (2026)

`MedicineCatalogSearch` with `variant="dispense"`:

- Calls `searchCatalog(query, { withStock: true })`
- Green badges: on-hand qty per formulation (tenant-scoped)
- Groups: in stock vs formulary-only (disabled)
- Hint when multiple formulations match same generic

---

## 18. Stock units UI

- `StockUnitSelect` on receive
- `StockUnitBadge` on POS, dashboard, reports
- Cart and receipts show unit labels via `formatQuantityWithUnit`

---

## 19. Routes (current)

| URL | Access |
|-----|--------|
| `/login` | Public |
| `/admin` | Platform admin |
| `/` | Dashboard |
| `/receive` | Owner, deputy |
| `/pos` | All facility roles |
| `/sales` | Owner, deputy |
| `/insights` | Owner, deputy |
| `/reports` | Owner, deputy |
| `/settings/team` | Owner only |

---

## 20. Not implemented (frontend gaps)

- Dark mode / theme toggle
- Dedicated low-stock-only page
- Inline password reset dialogs (admin/team use browser `prompt`)
- Owner change-own-password screen
- Offline / PWA
- Barcode scanner input
