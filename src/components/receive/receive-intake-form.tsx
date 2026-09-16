"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { MedicineCatalogSearch } from "@/components/catalog/medicine-catalog-search";
import { StockUnitSelect } from "@/components/ui/stock-unit-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { receiveInventory } from "@/lib/actions/inventory";
import {
  getProcurementOrder,
  listOpenProcurementOrders,
} from "@/lib/actions/procurement";
import { formatKes } from "@/lib/money";
import {
  stockUnitMeta,
  stockUnitOptionSupportsPackSize,
  stockUnitPlural,
  suggestStockUnitFromDosageForm,
  type StockUnitCode,
} from "@/lib/stock-unit";
import type { CatalogMedicine, ProcurementOrderLineView } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

export function ReceiveIntakeForm() {
  const [step, setStep] = useState<Step>(1);

  // Form state
  const [selected, setSelected] = useState<CatalogMedicine | null>(null);
  const [openOrders, setOpenOrders] = useState<
    Array<{ id: string; reference: string; status: string }>
  >([]);
  const [procurementOrderId, setProcurementOrderId] = useState("");
  const [procurementLineId, setProcurementLineId] = useState("");
  const [orderLines, setOrderLines] = useState<ProcurementOrderLineView[]>([]);
  const [batchNumber, setBatchNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [stockUnit, setStockUnit] = useState<StockUnitCode>("UNIT");
  const [unitsPerPack, setUnitsPerPack] = useState("");
  const [quantityOnHand, setQuantityOnHand] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [supplierCost, setSupplierCost] = useState("");
  const [retailSalePrice, setRetailSalePrice] = useState("");
  const [isSubmitting, startSubmit] = useTransition();

  const loadOpenOrders = useCallback(() => {
    startSubmit(async () => {
      const response = await listOpenProcurementOrders();
      if (response.success) setOpenOrders(response.data);
    });
  }, []);

  useEffect(() => {
    loadOpenOrders();
  }, [loadOpenOrders]);

  useEffect(() => {
    if (!procurementOrderId) {
      setOrderLines([]);
      setProcurementLineId("");
      return;
    }
    let cancelled = false;
    void getProcurementOrder(procurementOrderId).then((response) => {
      if (cancelled) return;
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      setOrderLines(
        response.data.lines.filter((l) => l.receivedQty < l.orderedQty),
      );
      if (response.data.supplierName) {
        setSupplierName((prev) => prev || response.data.supplierName || "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [procurementOrderId]);

  useEffect(() => {
    if (!selected) {
      setProcurementLineId("");
      return;
    }
    const match = orderLines.find((l) => l.medicineId === selected.id);
    setProcurementLineId(match?.id ?? "");
    if (match) {
      setStockUnit(match.stockUnit);
    } else {
      setStockUnit(suggestStockUnitFromDosageForm(selected.dosageForm));
    }
  }, [selected, orderLines]);

  const resetForm = () => {
    setStep(1);
    setSelected(null);
    setBatchNumber("");
    setSupplierName("");
    setUnitsPerPack("");
    setQuantityOnHand("");
    setExpiryDate("");
    setSupplierCost("");
    setRetailSalePrice("");
    setStockUnit("UNIT");
  };

  const showPackSize = stockUnitOptionSupportsPackSize(stockUnit);
  const unitLabel = stockUnitPlural(stockUnit, 1);
  const qtyNum = Number.parseInt(quantityOnHand, 10) || 0;
  const costNum = supplierCost.trim() ? Number.parseFloat(supplierCost) : null;
  const retailNum = retailSalePrice.trim() ? Number.parseFloat(retailSalePrice) : null;

  // Step validation helpers
  const canGoToStep2 = selected !== null;
  const canGoToStep3 =
    canGoToStep2 &&
    expiryDate.trim() !== "" &&
    batchNumber.trim() !== "";
  const canGoToStep4 =
    canGoToStep3 &&
    qtyNum > 0;

  const handleSelectMedicine = (med: CatalogMedicine) => {
    setSelected(med);
    setStep(2);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      toast.error("Select a medicine first");
      setStep(1);
      return;
    }

    if (!batchNumber.trim()) {
      toast.error("Batch/lot number is required");
      setStep(2);
      return;
    }

    if (!expiryDate) {
      toast.error("Expiry date is required");
      setStep(2);
      return;
    }

    if (qtyNum <= 0) {
      toast.error(`Enter a valid quantity (whole ${unitLabel}s)`);
      setStep(3);
      return;
    }

    let packSize: number | undefined;
    if (unitsPerPack.trim() !== "") {
      packSize = Number.parseInt(unitsPerPack, 10);
      if (!Number.isFinite(packSize) || packSize < 2) {
        toast.error("Pack size must be 2 or more");
        setStep(2);
        return;
      }
    }

    startSubmit(async () => {
      const response = await receiveInventory({
        medicineId: selected.id,
        batchNumber: batchNumber.trim() || undefined,
        supplierName: supplierName.trim() || undefined,
        quantityOnHand: qtyNum,
        expiryDate,
        stockUnit,
        unitsPerPack: packSize,
        supplierCost: costNum ?? undefined,
        retailSalePrice: retailNum ?? undefined,
        procurementOrderId: procurementOrderId || undefined,
        procurementLineId: procurementLineId || undefined,
      });

      if (!response.success) {
        toast.error(response.error);
        return;
      }

      toast.success(`Stock received: ${qtyNum} ${stockUnitPlural(stockUnit, qtyNum)} added to batch ${batchNumber || "new"}`);
      resetForm();
      if (procurementOrderId) {
        const refresh = await getProcurementOrder(procurementOrderId);
        if (refresh.success) {
          setOrderLines(
            refresh.data.lines.filter((l) => l.receivedQty < l.orderedQty),
          );
        }
        loadOpenOrders();
      }
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 1. Stepper Progress Bar */}
      <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-muted/40 border text-xs">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg font-semibold transition-all",
            step === 1
              ? "bg-card text-foreground shadow-xs"
              : selected
                ? "text-primary hover:bg-muted"
                : "text-muted-foreground",
          )}
        >
          <span className="size-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px]">
            {selected ? "✓" : "1"}
          </span>
          <span className="hidden sm:inline">Medicine</span>
        </button>

        <button
          type="button"
          disabled={!canGoToStep2}
          onClick={() => setStep(2)}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg font-semibold transition-all disabled:opacity-50",
            step === 2
              ? "bg-card text-foreground shadow-xs"
              : canGoToStep3
                ? "text-primary hover:bg-muted"
                : "text-muted-foreground",
          )}
        >
          <span className="size-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px]">
            {canGoToStep3 ? "✓" : "2"}
          </span>
          <span className="hidden sm:inline">Batch</span>
        </button>

        <button
          type="button"
          disabled={!canGoToStep3}
          onClick={() => setStep(3)}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg font-semibold transition-all disabled:opacity-50",
            step === 3
              ? "bg-card text-foreground shadow-xs"
              : canGoToStep4
                ? "text-primary hover:bg-muted"
                : "text-muted-foreground",
          )}
        >
          <span className="size-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px]">
            {canGoToStep4 ? "✓" : "3"}
          </span>
          <span className="hidden sm:inline">Quantity</span>
        </button>

        <button
          type="button"
          disabled={!canGoToStep4}
          onClick={() => setStep(4)}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg font-semibold transition-all disabled:opacity-50",
            step === 4
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground",
          )}
        >
          <span className="size-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px]">
            4
          </span>
          <span className="hidden sm:inline">Confirm</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: SELECT MEDICINE                                                   */}
      {/* ========================================================================= */}
      {step === 1 && (
        <section className="rounded-2xl border bg-card p-5 sm:p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              Step 1: Select Medicine
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Search the national KEML formulary for the product being received.
            </p>
          </div>

          {selected ? (
            <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-primary/40 bg-primary/5">
              <div>
                <p className="text-base font-bold text-foreground">{selected.genericName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[selected.strength, selected.dosageForm, selected.category].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs bg-card"
                onClick={() => setSelected(null)}
              >
                Change
              </Button>
            </div>
          ) : (
            <MedicineCatalogSearch
              inputId="receive-catalog-search"
              placeholder="Search by generic name, brand or form…"
              onSelect={handleSelectMedicine}
              disabled={isSubmitting}
            />
          )}

          {selected && (
            <div className="flex justify-end pt-2">
              <Button
                className="gap-1.5 text-xs font-semibold h-11 px-5"
                onClick={() => setStep(2)}
              >
                <span>Continue to Batch Details</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: BATCH & STOCK UNIT                                                */}
      {/* ========================================================================= */}
      {step === 2 && selected && (
        <section className="rounded-2xl border bg-card p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-baseline justify-between border-b pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                Step 2: Batch &amp; Stock Unit
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selected.genericName} &middot; {selected.strength}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              Step 2 of 4
            </Badge>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="batch-number">
                Batch / Lot Number <span className="text-rose-500">*</span>
              </label>
              <Input
                id="batch-number"
                className="h-11 rounded-xl text-base font-mono"
                placeholder="e.g. LOT-2026-0042"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="expiry-date">
                Expiry Date <span className="text-rose-500">*</span>
              </label>
              <Input
                id="expiry-date"
                type="date"
                className="h-11 rounded-xl text-base"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Crucial for automated FEFO (First-Expiry, First-Out) shelf sequencing.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="stock-unit">
                Stock Unit (How you count this medicine) <span className="text-rose-500">*</span>
              </label>
              <StockUnitSelect
                id="stock-unit"
                value={stockUnit}
                onChange={setStockUnit}
              />
            </div>

            {showPackSize && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="units-per-pack">
                  Items per {stockUnitMeta(stockUnit).label.toLowerCase()} (optional)
                </label>
                <Input
                  id="units-per-pack"
                  type="number"
                  min={2}
                  className="h-11 rounded-xl text-base"
                  placeholder="e.g. 100 tablets per box"
                  value={unitsPerPack}
                  onChange={(e) => setUnitsPerPack(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t">
            <Button
              variant="outline"
              className="gap-1 text-xs"
              onClick={() => setStep(1)}
            >
              <ArrowLeft className="size-3.5" />
              <span>Back</span>
            </Button>
            <Button
              className="gap-1.5 text-xs font-semibold h-11 px-5"
              disabled={!batchNumber.trim() || !expiryDate}
              onClick={() => setStep(3)}
            >
              <span>Continue to Quantity</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: QUANTITY & PRICING                                                */}
      {/* ========================================================================= */}
      {step === 3 && selected && (
        <section className="rounded-2xl border bg-card p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-baseline justify-between border-b pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                Step 3: Quantity &amp; Pricing
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selected.genericName} &middot; Batch: {batchNumber}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              Step 3 of 4
            </Badge>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="quantity">
                Quantity Received ({unitLabel}s) <span className="text-rose-500">*</span>
              </label>
              <Input
                id="quantity"
                type="number"
                min={1}
                step={1}
                className="h-12 rounded-xl text-lg font-bold"
                placeholder={`e.g. 500`}
                value={quantityOnHand}
                onChange={(e) => setQuantityOnHand(e.target.value)}
                autoFocus
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="supplier-cost">
                  Buying Price per {unitLabel} (KES)
                </label>
                <Input
                  id="supplier-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-11 rounded-xl text-base"
                  placeholder="e.g. 12.00"
                  value={supplierCost}
                  onChange={(e) => setSupplierCost(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="retail-price">
                  Selling Price per {unitLabel} (KES)
                </label>
                <Input
                  id="retail-price"
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-11 rounded-xl text-base"
                  placeholder="e.g. 20.00"
                  value={retailSalePrice}
                  onChange={(e) => setRetailSalePrice(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="supplier-name">
                Supplier / Vendor (optional)
              </label>
              <Input
                id="supplier-name"
                className="h-11 rounded-xl text-base"
                placeholder="e.g. KEMSA, Mission for Essential Drugs"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </div>

            {/* Optional PO link */}
            {openOrders.length > 0 && (
              <div className="space-y-1.5 rounded-xl border bg-muted/20 p-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="procurement-order">
                  Receive Against Purchase Order (optional)
                </label>
                <select
                  id="procurement-order"
                  className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={procurementOrderId}
                  onChange={(e) => setProcurementOrderId(e.target.value)}
                >
                  <option value="">No linked purchase order</option>
                  {openOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.reference} ({o.status.replace("_", " ").toLowerCase()})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t">
            <Button
              variant="outline"
              className="gap-1 text-xs"
              onClick={() => setStep(2)}
            >
              <ArrowLeft className="size-3.5" />
              <span>Back</span>
            </Button>
            <Button
              className="gap-1.5 text-xs font-semibold h-11 px-5"
              disabled={qtyNum <= 0}
              onClick={() => setStep(4)}
            >
              <span>Review &amp; Confirm</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* STEP 4: REVIEW & CONFIRM                                                  */}
      {/* ========================================================================= */}
      {step === 4 && selected && (
        <section className="rounded-2xl border bg-card p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-baseline justify-between border-b pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                Step 4: Confirm Delivery
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Verify details before adding this batch to live stock.
              </p>
            </div>
            <Badge variant="success" className="text-[10px]">
              Ready to stock
            </Badge>
          </div>

          {/* Delivery Summary Card */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3 text-xs">
            <div className="flex items-baseline justify-between border-b pb-2">
              <span className="text-muted-foreground">Medicine:</span>
              <span className="font-bold text-foreground text-right">{selected.genericName}</span>
            </div>
            <div className="flex items-baseline justify-between border-b pb-2">
              <span className="text-muted-foreground">Batch Number:</span>
              <span className="font-mono font-semibold text-foreground">{batchNumber}</span>
            </div>
            <div className="flex items-baseline justify-between border-b pb-2">
              <span className="text-muted-foreground">Expiry Date:</span>
              <span className="font-medium text-foreground">{expiryDate}</span>
            </div>
            <div className="flex items-baseline justify-between border-b pb-2">
              <span className="text-muted-foreground">Stock Being Added:</span>
              <span className="font-extrabold text-foreground text-sm text-primary">
                +{qtyNum} {stockUnitPlural(stockUnit, qtyNum)}
              </span>
            </div>
            {costNum !== null && (
              <div className="flex items-baseline justify-between border-b pb-2">
                <span className="text-muted-foreground">Buying Price:</span>
                <span className="font-medium text-foreground">{formatKes(costNum)} / {unitLabel}</span>
              </div>
            )}
            {retailNum !== null && (
              <div className="flex items-baseline justify-between border-b pb-2">
                <span className="text-muted-foreground">Selling Price (POS):</span>
                <span className="font-bold text-foreground">{formatKes(retailNum)} / {unitLabel}</span>
              </div>
            )}
            {supplierName && (
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Supplier:</span>
                <span className="font-medium text-foreground">{supplierName}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t">
            <Button
              variant="outline"
              className="gap-1 text-xs"
              onClick={() => setStep(3)}
              disabled={isSubmitting}
            >
              <ArrowLeft className="size-3.5" />
              <span>Back</span>
            </Button>
            <Button
              size="lg"
              className="gap-2 text-xs font-bold h-12 px-6"
              disabled={isSubmitting}
              onClick={handleSubmit}
            >
              <CheckCircle2 className="size-4" />
              <span>{isSubmitting ? "Receiving…" : "Receive Stock"}</span>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
