"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  getExpiryBadgeVariant,
  getExpiryRisk,
  getExpiryRiskLabel,
} from "@/lib/ui/stock-status";
import { formatKes } from "@/lib/money";
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
  pickQty: string;
  onPickQtyChange: (value: string) => void;
  onSelectBatch: (batch: StockBatchView) => void;
  disabled?: boolean;
};

export function BatchPicker({
  medicine,
  batches,
  pickQty,
  onPickQtyChange,
  onSelectBatch,
  disabled = false,
}: BatchPickerProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="font-semibold text-foreground">{medicine.genericName}</p>
        <p className="text-sm text-muted-foreground">
          {medicine.dosageForm} · {medicine.strength}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Pick the <strong>earliest expiry</strong> first (FEFO).
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="pick-qty">
          Quantity
        </label>
        <Input
          id="pick-qty"
          type="number"
          min={1}
          className="h-11 w-28 text-base"
          value={pickQty}
          disabled={disabled}
          onChange={(e) => onPickQtyChange(e.target.value)}
        />
      </div>

      <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {batches.map((batch, index) => {
          const days = daysUntil(batch.expiryDate);
          const risk = getExpiryRisk(days);
          const isFirst = index === 0;

          return (
            <li key={batch.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectBatch(batch)}
                className={cn(
                  "flex w-full min-h-[3.25rem] flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-colors",
                  "hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isFirst && "border-primary/50 bg-emerald-50/60",
                  disabled && "opacity-50",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium">
                    {batch.batchNumber ?? batch.id.slice(0, 8)}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {isFirst && <Badge variant="fefo">Use first</Badge>}
                    <Badge variant={getExpiryBadgeVariant(risk)}>
                      {getExpiryRiskLabel(risk)} · {days}d
                    </Badge>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">
                  {batch.quantityOnHand} units · Expires {batch.expiryDate}
                  {batch.retailSalePrice
                    ? ` · ${formatKes(batch.retailSalePrice)}/unit`
                    : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
