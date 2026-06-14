"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Keyboard, ShoppingCart, Trash2, WifiOff } from "lucide-react";
import { MedicineCatalogSearch } from "@/components/catalog/medicine-catalog-search";
import { BatchPicker } from "@/components/pos/batch-picker";
import { DispenseReceipt, type AnyReceipt } from "@/components/pos/dispense-receipt";
import { StockUnitBadge } from "@/components/pos/stock-unit-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCartStore } from "@/stores/cart-store";
import { useCartHydrated } from "@/stores/use-cart-hydrated";
import { getBatchesForMedicine } from "@/lib/actions/catalog";
import { dispenseMedicine } from "@/lib/actions/dispense";
import { formatKes } from "@/lib/money";
import {
  formatPricePerUnitLabel,
  formatQuantityWithUnit,
  normalizeStockUnit,
  stockUnitPlural,
  summarizeCartByUnit,
} from "@/lib/stock-unit";
import type { CatalogMedicine, StockBatchView } from "@/lib/types";

// Offline layer imports
import { useNetworkStatus } from "@/lib/offline/use-network-status";
import { useOfflineDB } from "@/lib/offline/use-offline-db";
import { dispenseOffline } from "@/lib/offline/offline-dispense";
import { getOfflineBatchesForMedicine, refreshTenantStockIfStale } from "@/lib/offline/stock-cache";
import {
  catalogSize,
  refreshCatalogIfStale,
  searchOfflineCatalog,
} from "@/lib/offline/catalog-cache";
import type { OfflineStockBatch } from "@/lib/offline/types";

// ---------------------------------------------------------------------------
// Helpers — adapt offline batch to the StockBatchView shape the UI expects
// ---------------------------------------------------------------------------

function offlineBatchToView(b: OfflineStockBatch): StockBatchView {
  return {
    id: b.batchId,
    medicineId: b.medicineId,
    batchNumber: b.batchNumber,
    quantityOnHand: b.quantityOnHand,
    expiryDate: b.expiryDate,
    receivedAt: new Date().toISOString(), // unknown offline; placeholder only
    supplierCost: null,
    retailSalePrice: b.retailSalePrice != null ? String(b.retailSalePrice) : null,
    supplierName: null,
    stockUnit: b.stockUnit,
    unitsPerPack: b.unitsPerPack,
  };
}

function offlineMedicineToCatalog(
  m: Awaited<ReturnType<typeof searchOfflineCatalog>>[number],
): CatalogMedicine {
  return {
    id: m.id,
    genericName: m.genericName,
    dosageForm: m.dosageForm,
    strength: m.strength,
    levelOfUse: m.levelOfUse,
    itemType: m.itemType,
    category: m.category,
    aliases: m.aliases,
    matchedBrand: null,
    // No live stock data offline — the batch picker will resolve real counts
    stock: undefined,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type PosTerminalProps = {
  /** Passed from the page so the offline stock cache is tenant-scoped. */
  tenantId: string;
};

export function PosTerminal({ tenantId }: PosTerminalProps) {
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  const [selectedMedicine, setSelectedMedicine] =
    useState<CatalogMedicine | null>(null);
  const [batches, setBatches] = useState<StockBatchView[]>([]);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [receipt, setReceipt] = useState<AnyReceipt | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [isLoadingBatches, startLoadBatches] = useTransition();
  const [isDispensing, startDispense] = useTransition();
  const [catalogCaching, setCatalogCaching] = useState(false);
  const [cachedMedicineCount, setCachedMedicineCount] = useState<number | null>(
    null,
  );

  // Offline state
  const { isOnline } = useNetworkStatus();
  const db = useOfflineDB();

  const lines = useCartStore((state) => state.lines);
  const addLine = useCartStore((state) => state.addLine);
  const removeLine = useCartStore((state) => state.removeLine);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const clearCart = useCartStore((state) => state.clear);
  const cartTotalAmount = useCartStore((state) => state.cartTotal);
  const cartHydrated = useCartHydrated();

  // Empty until sessionStorage rehydrates — matches SSR and prevents hydration errors.
  const displayLines = cartHydrated ? lines : [];
  const cartSummary = summarizeCartByUnit(displayLines);
  const cartTotal = cartHydrated ? cartTotalAmount() : 0;

  // -------------------------------------------------------------------------
  // Auto-focus search on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    searchWrapperRef.current?.querySelector("input")?.focus();
  }, []);

  // -------------------------------------------------------------------------
  // Bulk-seed KEML catalog + tenant stock for offline dispensing while online
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!db || !isOnline) return;

    let active = true;
    setCatalogCaching(true);

    Promise.all([
      refreshCatalogIfStale(db),
      refreshTenantStockIfStale(db, tenantId),
    ])
      .then(async ([catalogRefreshed]) => {
        if (!active) return;
        const count = await catalogSize(db);
        setCachedMedicineCount(count);
        if (catalogRefreshed && count > 0) {
          toast.success(`Cached ${count.toLocaleString()} medicines for offline use`, {
            duration: 4000,
          });
        }
      })
      .catch(() => {
        /* per-medicine batch cache still works as fallback for stock */
      })
      .finally(() => {
        if (active) setCatalogCaching(false);
      });

    return () => {
      active = false;
    };
  }, [db, isOnline, tenantId]);

  useEffect(() => {
    if (!db || isOnline) return;
    catalogSize(db).then((count) => {
      setCachedMedicineCount(count);
    });
  }, [db, isOnline]);


  // -------------------------------------------------------------------------
  // Open batch picker — online fetches from server, offline from IDB
  // ---------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Open batch picker — online fetches from server, offline from IDB
  // -------------------------------------------------------------------------
  const openBatchPicker = useCallback(
    (medicine: CatalogMedicine) => {
      startLoadBatches(async () => {
        if (isOnline) {
          // --- Online path (unchanged) ---
          const response = await getBatchesForMedicine(medicine.id);
          if (!response.success) {
            toast.error(response.error);
            return;
          }
          if (response.data.length === 0) {
            toast.error("No stock — receive inventory first");
            return;
          }

          // While online: opportunistically cache these batches into IDB
          // so they are available offline on the next disconnection.
          if (db) {
            const offlineBatches: OfflineStockBatch[] = response.data.map(
              (b) => ({
                tenantId,
                batchId: b.id,
                medicineId: b.medicineId,
                batchNumber: b.batchNumber,
                quantityOnHand: b.quantityOnHand,
                expiryDate: b.expiryDate,
                retailSalePrice: b.retailSalePrice
                  ? Number.parseFloat(b.retailSalePrice)
                  : null,
                stockUnit: b.stockUnit,
                unitsPerPack: b.unitsPerPack,
              }),
            );
            // Write each batch directly into the open IDB instance.
            // Using a single transaction for atomicity.
            const txw = db.transaction("tenant_stock", "readwrite");
            for (const b of offlineBatches) await txw.store.put(b);
            await txw.done;
          }

          setSelectedMedicine(medicine);
          setBatches(response.data);
          setBatchDialogOpen(true);
        } else {
          // --- Offline path: read batches from IDB ---
          if (!db) {
            toast.error("Offline cache not ready yet — please wait a moment");
            return;
          }
          const offlineBatches = await getOfflineBatchesForMedicine(
            db,
            tenantId,
            medicine.id,
          );
          if (offlineBatches.length === 0) {
            toast.error(
              "No cached stock for this medicine. Search it while online first.",
            );
            return;
          }
          setSelectedMedicine(medicine);
          setBatches(offlineBatches.map(offlineBatchToView));
          setBatchDialogOpen(true);
        }
      });
    },
    [isOnline, db, tenantId],
  );

  // -------------------------------------------------------------------------
  // Catalog search — online calls server action, offline reads IDB
  // -------------------------------------------------------------------------
  const handleOfflineCatalogSearch = useCallback(
    async (query: string): Promise<CatalogMedicine[]> => {
      if (!db) return [];
      const results = await searchOfflineCatalog(db, query);
      return results.map(offlineMedicineToCatalog);
    },
    [db],
  );

  // -------------------------------------------------------------------------
  // Add batch to cart (shared between online + offline paths)
  // -------------------------------------------------------------------------
  const addBatchToCart = (batch: StockBatchView, quantity: number) => {
    if (!selectedMedicine) return;

    if (quantity > batch.quantityOnHand) {
      toast.error(
        `Only ${formatQuantityWithUnit(
          batch.quantityOnHand,
          normalizeStockUnit(batch.stockUnit),
          batch.unitsPerPack,
        )} available`,
      );
      return;
    }

    const unit = normalizeStockUnit(batch.stockUnit);
    const unitPrice = batch.retailSalePrice
      ? Number.parseFloat(batch.retailSalePrice)
      : 0;

    addLine({
      medicineId: selectedMedicine.id,
      stockBatchId: batch.id,
      genericName: selectedMedicine.genericName,
      dosageForm: selectedMedicine.dosageForm,
      strength: selectedMedicine.strength,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      stockUnit: unit,
      unitsPerPack: batch.unitsPerPack,
      quantity,
      maxQuantity: batch.quantityOnHand,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    });

    toast.success(
      `Added ${formatQuantityWithUnit(quantity, unit, batch.unitsPerPack)} to cart`,
    );
  };

  // -------------------------------------------------------------------------
  // Complete dispense — online calls server action, offline queues in IDB
  // -------------------------------------------------------------------------
  const handleDispense = () => {
    if (lines.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    startDispense(async () => {
      if (isOnline) {
        // --- Online path (unchanged) ---
        const response = await dispenseMedicine(
          lines.map((line) => ({
            medicineId: line.medicineId,
            stockBatchId: line.stockBatchId,
            quantity: line.quantity,
          })),
        );
        if (!response.success) {
          toast.error(response.error);
          return;
        }
        clearCart();
        setReceipt(response.data);
        setReceiptOpen(true);
        toast.success("Dispense complete");
      } else {
        // --- Offline path ---
        if (!db) {
          toast.error("Offline cache not ready — try again in a moment");
          return;
        }
        const result = await dispenseOffline(db, tenantId, lines);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        clearCart();
        setReceipt(result.receipt);
        setReceiptOpen(true);
        toast.success("Sale saved offline — will sync when online", {
          duration: 5000,
        });
      }
      searchWrapperRef.current?.querySelector("input")?.focus();
    });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <>
      {isOnline && catalogCaching && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <span>
            <strong>Preparing offline cache…</strong> Downloading KEML medicines
            and your stock batches for offline dispensing.
          </span>
        </div>
      )}

      {/* Offline mode notice bar */}
      {!isOnline && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <span>
            <strong>Offline mode.</strong>{" "}
            {cachedMedicineCount && cachedMedicineCount > 0
              ? `Searching ${cachedMedicineCount.toLocaleString()} cached medicines. Sales sync when you reconnect.`
              : "No medicine catalog cached yet — connect while signed in on POS first."}
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Badge
          variant="secondary"
          className="w-full justify-center sm:w-auto sm:inline-flex"
        >
          {displayLines.length} line(s) · {cartSummary} · {formatKes(cartTotal)}
        </Badge>
        <Button
          size="lg"
          className="min-h-11 w-full px-6 text-base sm:w-auto"
          onClick={handleDispense}
          disabled={isDispensing || !cartHydrated || lines.length === 0}
        >
          {isDispensing
            ? isOnline
              ? "Dispensing…"
              : "Saving offline…"
            : isOnline
            ? "Complete dispense"
            : "Complete dispense (offline)"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="pharmacy-panel lg:col-span-2">
          <p className="pharmacy-panel-title mb-3">1 · Find medicine</p>
          <div ref={searchWrapperRef}>
            {isOnline ? (
              <MedicineCatalogSearch
                variant="dispense"
                inputId="catalog-search"
                onSelect={openBatchPicker}
                disabled={isDispensing}
              />
            ) : (
              /* Offline search: same UI shell, reads IDB instead of server */
              <OfflineCatalogSearch
                onSelect={openBatchPicker}
                disabled={isDispensing || !db}
                search={handleOfflineCatalogSearch}
              />
            )}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <Keyboard className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              {isOnline
                ? "After search, pick a batch and enter qty in that batch's unit (same as Receive). Prices are per tablet, box, bottle, etc."
                : "Showing cached stock. Quantities may be slightly outdated if others dispensed online recently."}
            </p>
          </div>
        </section>

        <section className="pharmacy-panel lg:col-span-3 lg:min-h-[28rem]">
          <div className="mb-4 flex items-center justify-between">
            <p className="pharmacy-panel-title flex items-center gap-2">
              <ShoppingCart className="size-4" />
              2 · Dispense cart
            </p>
            {displayLines.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={isDispensing}
                onClick={() => clearCart()}
              >
                <Trash2 className="mr-1 size-4" />
                Clear
              </Button>
            )}
          </div>

          {displayLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
              <ShoppingCart className="size-10 text-muted-foreground/50" />
              <p className="mt-3 font-medium">Cart is empty</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Each line shows quantity in the unit defined at receive (e.g.
                tablets or boxes). Stock deducts in that same unit on dispense.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {displayLines.map((line) => {
                const unit = normalizeStockUnit(line.stockUnit);
                return (
                  <li
                    key={line.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold leading-snug">
                          {line.genericName}
                        </p>
                        <StockUnitBadge
                          unit={unit}
                          unitsPerPack={line.unitsPerPack}
                          className="text-[10px]"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {line.dosageForm} · {line.strength}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Batch {line.batchNumber ?? "—"} · Exp {line.expiryDate}
                      </p>
                      <p className="mt-2 text-sm">
                        <span className="font-medium text-primary">
                          {formatQuantityWithUnit(
                            line.quantity,
                            unit,
                            line.unitsPerPack,
                          )}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          × {formatPricePerUnitLabel(line.unitPrice, unit)}
                        </span>
                        <span className="ml-2 font-semibold">
                          = {formatKes(line.lineTotal)}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <label className="sr-only">
                        Quantity in {stockUnitPlural(unit, 2)}
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={line.maxQuantity}
                        value={line.quantity}
                        disabled={isDispensing}
                        className="h-12 w-24 text-center text-lg font-semibold"
                        aria-label={`Quantity in ${stockUnitPlural(unit, 2)}`}
                        onChange={(e) =>
                          updateQuantity(
                            line.id,
                            Number.parseInt(e.target.value, 10) || 1,
                          )
                        }
                      />
                      <span className="text-center text-xs font-medium text-muted-foreground">
                        {stockUnitPlural(unit, line.quantity)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        max {line.maxQuantity}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      disabled={isDispensing}
                      onClick={() => removeLine(line.id)}
                    >
                      Remove
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {displayLines.length > 0 && (
            <div className="mt-4 text-right">
              <p className="text-sm text-muted-foreground">{cartSummary}</p>
              <p className="text-lg font-semibold">
                Cart total {formatKes(cartTotal)}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Batch picker dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="mx-2 max-h-[90dvh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:mx-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pick batch & quantity</DialogTitle>
            <DialogDescription>
              {isOnline
                ? "Dispense in the same unit used at receive (per batch). Select a lot, enter qty, then add to cart."
                : "Showing cached stock quantities — may be slightly outdated."}
            </DialogDescription>
          </DialogHeader>
          {selectedMedicine && (
            <BatchPicker
              medicine={selectedMedicine}
              batches={batches}
              onAddToCart={(batch, qty) => {
                addBatchToCart(batch, qty);
              }}
              disabled={isLoadingBatches}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dispense / offline receipt dialog */}
      <DispenseReceipt
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        receipt={receipt}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Minimal offline catalog search UI (mirrors MedicineCatalogSearch shell)
// ---------------------------------------------------------------------------

function OfflineCatalogSearch({
  onSelect,
  disabled,
  search,
}: {
  onSelect: (m: CatalogMedicine) => void;
  disabled: boolean;
  search: (q: string) => Promise<CatalogMedicine[]>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogMedicine[]>([]);
  const [searching, setSearching] = useState(false);

  const handleChange = async (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await search(value));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-background shadow-sm">
      <div className="flex items-center border-b border-border/60 px-3">
        <WifiOff className="size-5 shrink-0 text-amber-500" aria-hidden />
        <input
          id="catalog-search"
          className="h-12 flex-1 border-0 bg-transparent px-3 text-base shadow-none outline-none placeholder:text-muted-foreground disabled:opacity-50"
          placeholder="Search cached medicines (offline)…"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {query.length >= 2 && (
        <ul className="max-h-80 divide-y divide-border/50 overflow-y-auto">
          {searching && (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              Searching offline catalog…
            </li>
          )}
          {!searching && results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              Not in offline cache — search this medicine while online first.
            </li>
          )}
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={disabled}
                className="w-full px-4 py-2.5 text-left hover:bg-accent disabled:opacity-50"
                onClick={() => {
                  onSelect(m);
                  setQuery("");
                  setResults([]);
                }}
              >
                <p className="font-medium">{m.genericName}</p>
                <p className="text-xs text-muted-foreground">
                  {m.dosageForm} · {m.strength}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
