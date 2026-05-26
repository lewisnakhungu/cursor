"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getExpiryBadgeVariant,
  getExpiryRisk,
  getExpiryRiskLabel,
} from "@/lib/ui/stock-status";
import { formatKes } from "@/lib/money";
import {
  formatPricePerUnitLabel,
  formatPricePerUnitShort,
  formatQuantityWithUnit,
  normalizeStockUnit,
  stockUnitPlural,
} from "@/lib/stock-unit";
import { StockUnitBadge } from "@/components/pos/stock-unit-badge";
import type { CatalogMedicine, StockBatchView } from "@/lib/types";
import { cn } from "@/lib/utils";

function daysUntil(expiryDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
}

type BatchPickerProps = {
  medicine: CatalogMedicine;
  batches: StockBatchView[];
  onAddToCart: (batch: StockBatchView, quantity: number) => void;
  disabled?: boolean;
};

export function BatchPicker({
  medicine,
  batches,
  onAddToCart,
  disabled = false,
}: BatchPickerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    batches[0]?.id ?? null,
  );
  const [pickQty, setPickQty] = useState("1");

  useEffect(() => {
    setSelectedId(batches[0]?.id ?? null);
    setPickQty("1");
  }, [batches]);

  const selected =
    batches.find((b) => b.id === selectedId) ?? batches[0] ?? null;

  const selectedUnit = selected
    ? normalizeStockUnit(selected.stockUnit)
    : "UNIT";

  const qty = Number.parseInt(pickQty, 10);
  const qtyValid = Number.isFinite(qty) && qty > 0;
  const linePreview =
    selected && qtyValid && selected.retailSalePrice
      ? qty * Number.parseFloat(selected.retailSalePrice)
      : null;

  const handleAdd = () => {
    if (!selected || !qtyValid) return;
    if (qty > selected.quantityOnHand) return;
    onAddToCart(selected, qty);
    setPickQty("1");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="font-semibold text-foreground">{medicine.genericName}</p>
        <p className="text-sm text-muted-foreground">
          {medicine.dosageForm} · {medicine.strength}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Select a batch (FEFO = earliest expiry first), then enter how many to
          dispense in <strong>that batch&apos;s counting unit</strong>.
        </p>
      </div>

      <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {batches.map((batch, index) => {
          const days = daysUntil(batch.expiryDate);
          const risk = getExpiryRisk(days);
          const isFirst = index === 0;
          const isSelected = batch.id === selectedId;
          const unit = normalizeStockUnit(batch.stockUnit);

          return (
            <li key={batch.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setSelectedId(batch.id)}
                className={cn(
                  "flex w-full min-h-[3.25rem] flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-colors",
                  "hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isFirst && !isSelected && "border-primary/30 bg-emerald-50/40",
                  isSelected && "border-primary ring-2 ring-primary/30 bg-primary/5",
                  disabled && "opacity-50",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium">
                    {batch.batchNumber ?? batch.id.slice(0, 8)}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <StockUnitBadge
                      unit={unit}
                      unitsPerPack={batch.unitsPerPack}
                      className="text-[10px]"
                    />
                    {isFirst && <Badge variant="fefo">Use first</Badge>}
                    <Badge variant={getExpiryBadgeVariant(risk)}>
                      {getExpiryRiskLabel(risk)} · {days}d
                    </Badge>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatQuantityWithUnit(
                    batch.quantityOnHand,
                    unit,
                    batch.unitsPerPack,
                  )}{" "}
                  on hand · Expires {batch.expiryDate}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {batch.retailSalePrice
                    ? formatPricePerUnitLabel(
                        Number.parseFloat(batch.retailSalePrice),
                        unit,
                      )
                    : "No retail price — set at Receive"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected && (
        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Dispense from</span>
            <span className="font-mono text-sm">
              {selected.batchNumber ?? selected.id.slice(0, 8)}
            </span>
            <StockUnitBadge
              unit={selectedUnit}
              unitsPerPack={selected.unitsPerPack}
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="pick-qty"
              >
                Quantity ({stockUnitPlural(selectedUnit, 2)})
              </label>
              <Input
                id="pick-qty"
                type="number"
                min={1}
                max={selected.quantityOnHand}
                className="h-12 w-32 text-center text-lg font-semibold"
                value={pickQty}
                disabled={disabled}
                onChange={(e) => setPickQty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Max{" "}
                {formatQuantityWithUnit(
                  selected.quantityOnHand,
                  selectedUnit,
                  selected.unitsPerPack,
                )}
              </p>
            </div>

            <Button
              type="button"
              size="lg"
              className="min-h-12 flex-1 sm:flex-none"
              disabled={
                disabled ||
                !qtyValid ||
                qty > selected.quantityOnHand
              }
              onClick={handleAdd}
            >
              Add {qtyValid ? qty : "…"} {stockUnitPlural(selectedUnit, qty || 1)}
            </Button>
          </div>

          {qtyValid && selected.retailSalePrice && linePreview !== null && (
            <p className="text-sm text-muted-foreground">
              Line total:{" "}
              <span className="font-semibold text-foreground">
                {formatKes(linePreview)}
              </span>{" "}
              ({qty} × {formatPricePerUnitShort(selected.retailSalePrice, selectedUnit)})
            </p>
          )}
        </div>
      )}
    </div>
  );
}
