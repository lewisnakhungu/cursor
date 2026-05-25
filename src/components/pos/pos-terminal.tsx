"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Keyboard, ShoppingCart, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { MedicineCatalogSearch } from "@/components/catalog/medicine-catalog-search";
import { BatchPicker } from "@/components/pos/batch-picker";
import { DispenseReceipt } from "@/components/pos/dispense-receipt";
import {
  Dialog,
  DialogContent,
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
import type { CatalogMedicine, DispenseResult, StockBatchView } from "@/lib/types";

export function PosTerminal() {
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const [selectedMedicine, setSelectedMedicine] =
    useState<CatalogMedicine | null>(null);
  const [batches, setBatches] = useState<StockBatchView[]>([]);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [pickQty, setPickQty] = useState("1");
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

  const cartUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
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
      setPickQty("1");
      setBatchDialogOpen(true);
    });
  }, []);

  const addBatchToCart = (batch: StockBatchView) => {
    if (!selectedMedicine) return;
    const quantity = Number.parseInt(pickQty, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (quantity > batch.quantityOnHand) {
      toast.error(`Only ${batch.quantityOnHand} units in this batch`);
      return;
    }

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
      quantity,
      maxQuantity: batch.quantityOnHand,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    });

    setBatchDialogOpen(false);
    setSelectedMedicine(null);
    searchWrapperRef.current?.querySelector("input")?.focus();
    toast.success("Added to cart");
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
      subtitle="FEFO batch selection · transactional checkout · thermal receipt"
      actions={
        <>
          <Badge variant="secondary" className="w-full justify-center sm:w-auto sm:inline-flex">
            {lines.length} line(s) · {cartUnits} units · {formatKes(cartTotal)}
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
              inputId="catalog-search"
              onSelect={openBatchPicker}
              disabled={isDispensing}
            />
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <Keyboard className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              Search by generic name. Select a row to pick batch (earliest expiry
              highlighted). Esc clears search.
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
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Search the KEML catalog and add batches. Stock deducts on
                dispense using FEFO rules.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">
                      {line.genericName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {line.dosageForm} · {line.strength}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      Batch {line.batchNumber ?? "—"} · Exp {line.expiryDate}
                    </p>
                    <p className="mt-1 text-sm font-medium text-primary">
                      {line.quantity} × {formatKes(line.unitPrice)} ={" "}
                      {formatKes(line.lineTotal)}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={line.maxQuantity}
                    value={line.quantity}
                    disabled={isDispensing}
                    className="h-11 w-20 text-center text-base"
                    onChange={(e) =>
                      updateQuantity(
                        line.id,
                        Number.parseInt(e.target.value, 10) || 1,
                      )
                    }
                  />
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
              ))}
            </ul>
          )}
          {lines.length > 0 && (
            <p className="mt-4 text-right text-lg font-semibold">
              Cart total {formatKes(cartTotal)}
            </p>
          )}
        </section>
      </div>

      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="mx-2 max-h-[90dvh] max-w-[calc(100vw-1rem)] overflow-y-auto sm:mx-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select batch (FEFO)</DialogTitle>
          </DialogHeader>
          {selectedMedicine && (
            <BatchPicker
              medicine={selectedMedicine}
              batches={batches}
              pickQty={pickQty}
              onPickQtyChange={setPickQty}
              onSelectBatch={addBatchToCart}
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
