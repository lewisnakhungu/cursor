"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  History,
  PackagePlus,
  ShoppingCart,
  Timer,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatKes } from "@/lib/money";
import { stockUnitPlural } from "@/lib/stock-unit";
import { getMedicineStockMovements } from "@/lib/actions/inventory";
import type { InventoryMedicineRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type MedicineDetailModalProps = {
  medicine: InventoryMedicineRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MedicineDetailModal({
  medicine,
  open,
  onOpenChange,
}: MedicineDetailModalProps) {
  const [movements, setMovements] = useState<
    Array<{
      id: string;
      type: string;
      quantityDelta: number;
      balanceAfter: number;
      referenceType: string;
      reason: string | null;
      createdAt: string;
    }>
  >([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  useEffect(() => {
    if (!medicine || !open) {
      setMovements([]);
      return;
    }
    setLoadingMovements(true);
    getMedicineStockMovements(medicine.id)
      .then((res) => {
        if (res.success) {
          setMovements(res.data);
        }
      })
      .finally(() => {
        setLoadingMovements(false);
      });
  }, [medicine, open]);

  if (!medicine) return null;

  const unitName = stockUnitPlural(medicine.stockUnit, medicine.totalOnHand);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                {medicine.genericName}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {[medicine.strength, medicine.dosageForm, medicine.category]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Badge
              variant={
                medicine.status === "CRITICAL" || medicine.status === "EXPIRED"
                  ? "critical"
                  : medicine.status === "EXPIRING" || medicine.status === "LOW_STOCK"
                    ? "warning"
                    : "success"
              }
              className="text-[10px] font-semibold shrink-0 uppercase tracking-wider"
            >
              {medicine.statusLabel}
            </Badge>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Section 1: Stock Overview */}
          <section className="rounded-xl border bg-card p-3.5 shadow-xs">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                On Hand Stock
              </span>
              <span className="text-xs text-muted-foreground">
                {medicine.batchCount} batch{medicine.batchCount === 1 ? "" : "es"}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-foreground">
                {medicine.totalOnHand}
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {unitName}
              </span>
            </div>
            {medicine.status === "LOW_STOCK" && (
              <p className="text-xs text-rose-600 font-medium mt-1">
                Stock is at or below threshold (&le;10 {unitName}). Reorder suggested.
              </p>
            )}
          </section>

          {/* Section 2: Batches & FEFO Order */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between px-0.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Timer className="size-3.5" />
                <span>Batches (FEFO Pull Order)</span>
              </h4>
              <span className="text-[11px] text-muted-foreground">Earliest expiry first</span>
            </div>

            <div className="space-y-2">
              {medicine.batches.map((batch, idx) => {
                const isCritical = batch.daysUntilExpiry <= 30;
                const isExpiringSoon = batch.daysUntilExpiry > 30 && batch.daysUntilExpiry <= 90;

                return (
                  <div
                    key={batch.id}
                    className={cn(
                      "p-3 rounded-xl border transition-all text-xs",
                      batch.isFefoPriority
                        ? "border-primary/50 bg-primary/5 shadow-xs"
                        : "bg-card border-border/80",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-foreground">
                            {batch.batchNumber || `Batch #${idx + 1}`}
                          </span>
                          {batch.isFefoPriority && (
                            <Badge variant="success" className="text-[9px] px-1.5 py-0">
                              ✓ Use first (FEFO)
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Calendar className="size-3" />
                          <span>Expires {batch.expiryDate}</span>
                          <span
                            className={cn(
                              "font-semibold",
                              isCritical
                                ? "text-rose-600"
                                : isExpiringSoon
                                  ? "text-amber-600"
                                  : "text-muted-foreground",
                            )}
                          >
                            ({batch.daysUntilExpiry} days)
                          </span>
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-foreground">
                          {batch.quantityOnHand} {stockUnitPlural(batch.stockUnit, batch.quantityOnHand)}
                        </p>
                        {batch.retailSalePrice != null && (
                          <p className="text-[10px] text-muted-foreground">
                            {formatKes(batch.retailSalePrice)} / {stockUnitPlural(batch.stockUnit, 1)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 3: Recent Activity (Immutable Stock Movements) */}
          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 px-0.5">
              <History className="size-3.5" />
              <span>Recent Movements</span>
            </h4>

            {loadingMovements ? (
              <p className="text-xs text-muted-foreground py-2">Loading activity...</p>
            ) : movements.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No recent movements recorded.</p>
            ) : (
              <div className="divide-y rounded-xl border bg-card text-xs">
                {movements.map((m) => {
                  const isPositive = m.quantityDelta > 0;
                  return (
                    <div key={m.id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">
                          {m.type === "RECEIVE"
                            ? "Stock received"
                            : m.type === "DISPENSE"
                              ? "Dispensed to customer"
                              : m.type === "VOIDED_RETURN"
                                ? "Sale voided (returned)"
                                : m.type.replace("_", " ")}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(m.createdAt).toLocaleString("en-KE", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                          {m.reason ? ` · ${m.reason}` : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "font-bold font-mono",
                          isPositive ? "text-emerald-600" : "text-rose-600",
                        )}
                      >
                        {isPositive ? `+${m.quantityDelta}` : m.quantityDelta}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Sticky Action Footer */}
        <div className="p-3.5 border-t bg-muted/10 flex items-center gap-2">
          <Link href={`/pos`} className="flex-1" onClick={() => onOpenChange(false)}>
            <Button className="w-full gap-1.5 h-10 text-xs font-semibold">
              <ShoppingCart className="size-3.5" />
              <span>Dispense</span>
            </Button>
          </Link>
          <Link href={`/receive`} className="flex-1" onClick={() => onOpenChange(false)}>
            <Button variant="outline" className="w-full gap-1.5 h-10 text-xs font-semibold bg-card">
              <PackagePlus className="size-3.5" />
              <span>Receive stock</span>
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
