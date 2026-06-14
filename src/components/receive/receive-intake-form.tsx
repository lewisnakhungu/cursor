"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, Package } from "lucide-react";
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
import {
  formatPricePerUnitLabel,
  stockUnitMeta,
  stockUnitOptionSupportsPackSize,
  stockUnitPlural,
  suggestStockUnitFromDosageForm,
  type StockUnitCode,
} from "@/lib/stock-unit";
import type { CatalogMedicine, ProcurementOrderLineView } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ReceiveIntakeForm() {
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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) {
      toast.error("Select a medicine from the catalog first");
      return;
    }

    const qty = Number.parseInt(quantityOnHand, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error(`Enter a valid quantity (whole ${unitLabel}s)`);
      return;
    }
    if (!expiryDate) {
      toast.error("Expiry date is required");
      return;
    }

    const cost =
      supplierCost.trim() === "" ? undefined : Number.parseFloat(supplierCost);
    const retail =
      retailSalePrice.trim() === ""
        ? undefined
        : Number.parseFloat(retailSalePrice);

    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) {
      toast.error("Invalid supplier cost");
      return;
    }
    if (retail !== undefined && (!Number.isFinite(retail) || retail < 0)) {
      toast.error("Invalid retail sale price");
      return;
    }

    let packSize: number | undefined;
    if (unitsPerPack.trim() !== "") {
      packSize = Number.parseInt(unitsPerPack, 10);
      if (!Number.isFinite(packSize) || packSize < 2) {
        toast.error("Pack size must be 2 or more (e.g. 100 tablets per box)");
        return;
      }
    }

    startSubmit(async () => {
      const response = await receiveInventory({
        medicineId: selected.id,
        batchNumber: batchNumber.trim() || undefined,
        supplierName: supplierName.trim() || undefined,
        quantityOnHand: qty,
        expiryDate,
        stockUnit,
        unitsPerPack: packSize,
        supplierCost: cost,
        retailSalePrice: retail,
        procurementOrderId: procurementOrderId || undefined,
        procurementLineId: procurementLineId || undefined,
      });

      if (!response.success) {
        toast.error(response.error);
        return;
      }

      toast.success(`Batch received · ${response.data.batchId.slice(0, 8)}…`);
      resetForm();
      setSelected(null);
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
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge
          variant={selected ? "success" : "outline"}
          className="min-h-8 px-3"
        >
          <span className="mr-1.5">1</span> Medicine
          {selected && <CheckCircle2 className="ml-1 size-3.5" />}
        </Badge>
        <Badge
          variant={expiryDate && quantityOnHand ? "success" : "outline"}
          className="min-h-8 px-3"
        >
          <span className="mr-1.5">2</span> Batch & counting unit
        </Badge>
        <Badge variant="outline" className="min-h-8 px-3">
          <span className="mr-1.5">3</span> Confirm receive
        </Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="pharmacy-panel">
          <p className="pharmacy-panel-title mb-3 flex items-center gap-2">
            <ClipboardList className="size-4" />
            Select medicine
          </p>
          <MedicineCatalogSearch
            inputId="receive-catalog-search"
            placeholder="Search KEML to receive stock…"
            onSelect={setSelected}
            disabled={isSubmitting}
          />
          {selected ? (
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-lg font-semibold">{selected.genericName}</p>
              <p className="text-sm text-muted-foreground">
                {selected.dosageForm} · {selected.strength}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Search and select the formulary item this delivery belongs to.
            </p>
          )}
        </section>

        <section className="pharmacy-panel">
          <p className="pharmacy-panel-title mb-4 flex items-center gap-2">
            <Package className="size-4" />
            Batch, unit of measure & pricing
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            {openOrders.length > 0 ? (
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <label className="text-sm font-medium" htmlFor="procurement-order">
                  Receiving against order (optional)
                </label>
                <select
                  id="procurement-order"
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={procurementOrderId}
                  onChange={(e) => setProcurementOrderId(e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="">No linked order</option>
                  {openOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.reference} ({o.status.replace("_", " ").toLowerCase()})
                    </option>
                  ))}
                </select>
                {procurementLineId && selected ? (
                  <p className="text-xs text-emerald-700">
                    Linked to order line for {selected.genericName}
                  </p>
                ) : null}
                {procurementOrderId && orderLines.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {orderLines.slice(0, 4).map((line) => (
                      <li key={line.id}>
                        {line.genericName}: {line.receivedQty}/{line.orderedQty}{" "}
                        {stockUnitMeta(line.stockUnit).label} pending
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
              <strong className="text-foreground">Counting rule:</strong> quantity,
              supplier cost, and retail price all refer to the same unit (e.g. per
              box or per tablet). Reports will label quantities using your choice
              below.
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium" htmlFor="supplier-name">
                  Supplier / vendor
                </label>
                <Input
                  id="supplier-name"
                  className="h-11 text-base"
                  placeholder="e.g. KEMSA, Mission for Essential Drugs"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  disabled={isSubmitting || !selected}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium" htmlFor="batch-number">
                  Batch / lot number
                </label>
                <Input
                  id="batch-number"
                  className="h-11 text-base"
                  placeholder="LOT-2026-0042"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  disabled={isSubmitting || !selected}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="stock-unit">
                  Count stock as
                </label>
                <StockUnitSelect
                  id="stock-unit"
                  value={stockUnit}
                  onChange={setStockUnit}
                  disabled={isSubmitting || !selected}
                />
              </div>

              {showPackSize && (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="units-per-pack">
                    Items per {stockUnitMeta(stockUnit).label.toLowerCase()}{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </label>
                  <Input
                    id="units-per-pack"
                    type="number"
                    min={2}
                    step={1}
                    className="h-11 text-base"
                    placeholder="e.g. 100 tablets per box"
                    value={unitsPerPack}
                    onChange={(e) => setUnitsPerPack(e.target.value)}
                    disabled={isSubmitting || !selected}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="quantity">
                  Quantity received ({unitLabel}s)
                </label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  step={1}
                  className="h-11 text-base"
                  placeholder={`How many ${stockUnitPlural(stockUnit, 2)}?`}
                  value={quantityOnHand}
                  onChange={(e) => setQuantityOnHand(e.target.value)}
                  disabled={isSubmitting || !selected}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="expiry-date">
                  Expiry date
                </label>
                <Input
                  id="expiry-date"
                  type="date"
                  className="h-11 text-base"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  disabled={isSubmitting || !selected}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="supplier-cost">
                  Supplier cost per {unitLabel} (KES)
                </label>
                <Input
                  id="supplier-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-11"
                  placeholder="Optional"
                  value={supplierCost}
                  onChange={(e) => setSupplierCost(e.target.value)}
                  disabled={isSubmitting || !selected}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="retail-price">
                  Retail price per {unitLabel} (KES)
                </label>
                <Input
                  id="retail-price"
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-11"
                  placeholder="Used at POS for this batch"
                  value={retailSalePrice}
                  onChange={(e) => setRetailSalePrice(e.target.value)}
                  disabled={isSubmitting || !selected}
                />
                {retailSalePrice.trim() !== "" &&
                  Number.isFinite(Number.parseFloat(retailSalePrice)) && (
                    <p className="text-xs text-muted-foreground">
                      {formatPricePerUnitLabel(
                        Number.parseFloat(retailSalePrice),
                        stockUnit,
                      )}
                    </p>
                  )}
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className={cn(
                "min-h-12 w-full text-base sm:w-auto",
                !selected && "opacity-60",
              )}
              disabled={isSubmitting || !selected}
            >
              {isSubmitting ? "Receiving…" : "Confirm receive"}
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}
