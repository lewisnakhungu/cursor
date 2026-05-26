"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Keyboard, ShoppingCart, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { MedicineCatalogSearch } from "@/components/catalog/medicine-catalog-search";
import { BatchPicker } from "@/components/pos/batch-picker";
import { DispenseReceipt } from "@/components/pos/dispense-receipt";
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
import type { CatalogMedicine, DispenseResult, StockBatchView } from "@/lib/types";

export function PosTerminal() {
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const [selectedMedicine, setSelectedMedicine] =
    useState<CatalogMedicine | null>(null);
  const [batches, setBatches] = useState<StockBatchView[]>([]);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [receipt, setReceipt] = useState<DispenseResult | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [isLoadingBatches, startLoadBatches] = useTransition();
  const [isDispensing, startDispense] = useTransition();

  const lines = useCartStore((state) => state.lines);
  const addLine = useCartStore((state) => state.addLine);
  const removeLine = useCartStore((state) => state.removeLine);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const clearCart = useCartStore((state) => state.clear);
  const cartTotalAmount = useCartStore((state) => state.cartTotal);

  const cartSummary = summarizeCartByUnit(lines);
  const cartTotal = cartTotalAmount();

  useEffect(() => {
    searchWrapperRef.current?.querySelector("input")?.focus();
  }, []);

  const openBatchPicker = useCallback((medicine: CatalogMedicine) => {
    startLoadBatches(async () => {
      const response = await getBatchesForMedicine(medicine.id);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      if (response.data.length === 0) {
        toast.error("No stock — receive inventory first");
        return;
      }
      setSelectedMedicine(medicine);
      setBatches(response.data);
      setBatchDialogOpen(true);
    });
  }, []);

  const addBatchToCart = (batch: StockBatchView, quantity: number) => {
    if (!selectedMedicine) return;

    if (quantity > batch.quantityOnHand) {
      toast.error(
        `Only ${formatQuantityWithUnit(batch.quantityOnHand, normalizeStockUnit(batch.stockUnit), batch.unitsPerPack)} available`,
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

  const handleDispense = () => {
    if (lines.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    startDispense(async () => {
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
      searchWrapperRef.current?.querySelector("input")?.focus();
    });
  };

  return (
    <AppShell
      wide
      title="Dispense (POS)"
      subtitle="Quantities use each batch's counting unit (tablets, boxes, etc.)"
      actions={
        <>
          <Badge
            variant="secondary"
            className="w-full justify-center sm:w-auto sm:inline-flex"
          >
            {lines.length} line(s) · {cartSummary} · {formatKes(cartTotal)}
          </Badge>
          <Button
            size="lg"
            className="min-h-11 w-full px-6 text-base sm:w-auto"
            onClick={handleDispense}
            disabled={isDispensing || lines.length === 0}
          >
            {isDispensing ? "Dispensing…" : "Complete dispense"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-5">
        <section className="pharmacy-panel lg:col-span-2">
          <p className="pharmacy-panel-title mb-3">1 · Find medicine</p>
          <div ref={searchWrapperRef}>
            <MedicineCatalogSearch
              variant="dispense"
              inputId="catalog-search"
              onSelect={openBatchPicker}
              disabled={isDispensing}
            />
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <Keyboard className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              After search, pick a batch and enter qty in that batch&apos;s unit
              (same as Receive). Prices are per tablet, box, bottle, etc.
            </p>
          </div>
        </section>

        <section className="pharmacy-panel lg:col-span-3 lg:min-h-[28rem]">
          <div className="mb-4 flex items-center justify-between">
            <p className="pharmacy-panel-title flex items-center gap-2">
              <ShoppingCart className="size-4" />
              2 · Dispense cart
            </p>
            {lines.length > 0 && (
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

          {lines.length === 0 ? (
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
              {lines.map((line) => {
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
          {lines.length > 0 && (
            <div className="mt-4 text-right">
              <p className="text-sm text-muted-foreground">{cartSummary}</p>
              <p className="text-lg font-semibold">
                Cart total {formatKes(cartTotal)}
              </p>
            </div>
          )}
        </section>
      </div>

      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="mx-2 max-h-[90dvh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:mx-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pick batch & quantity</DialogTitle>
            <DialogDescription>
              Dispense in the same unit used at receive (per batch). Select a
              lot, enter qty, then add to cart.
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

      <DispenseReceipt
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        receipt={receipt}
      />
    </AppShell>
  );
}
