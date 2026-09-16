"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight,
  Package,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { stockUnitPlural } from "@/lib/stock-unit";
import { MedicineDetailModal } from "@/components/inventory/medicine-detail-modal";
import type { InventoryMedicineRow, InventoryOverviewData } from "@/lib/types";
import { cn } from "@/lib/utils";

type FilterTab = "all" | "low_stock" | "expiring" | "expired";

export function InventoryView({
  initialData,
}: {
  initialData: InventoryOverviewData;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selectedMedicine, setSelectedMedicine] =
    useState<InventoryMedicineRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const filteredMedicines = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialData.medicines.filter((med) => {
      // Query match
      if (q) {
        const matchesName = med.genericName.toLowerCase().includes(q);
        const matchesStrength = med.strength.toLowerCase().includes(q);
        const matchesForm = med.dosageForm.toLowerCase().includes(q);
        const matchesBatch = med.batches.some((b) =>
          b.batchNumber?.toLowerCase().includes(q),
        );
        if (!matchesName && !matchesStrength && !matchesForm && !matchesBatch) {
          return false;
        }
      }

      // Filter tab
      if (filter === "low_stock") {
        return med.status === "LOW_STOCK";
      }
      if (filter === "expiring") {
        return med.status === "EXPIRING" || med.status === "CRITICAL";
      }
      if (filter === "expired") {
        return med.status === "EXPIRED";
      }
      return true;
    });
  }, [initialData.medicines, query, filter]);

  const handleOpenDetail = (med: InventoryMedicineRow) => {
    setSelectedMedicine(med);
    setModalOpen(true);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-16">
      {/* 1. Metric Summary Strip */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl border bg-card p-2 sm:p-3 shadow-xs">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Medicines</p>
          <p className="text-base sm:text-xl font-bold text-foreground mt-0.5">
            {initialData.totalMedicines}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-2 sm:p-3 shadow-xs">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">Batches</p>
          <p className="text-base sm:text-xl font-bold text-foreground mt-0.5">
            {initialData.totalActiveBatches}
          </p>
        </div>
        <div
          onClick={() => setFilter("low_stock")}
          className={cn(
            "rounded-xl border p-2 sm:p-3 shadow-xs cursor-pointer transition-all",
            initialData.totalLowStock > 0
              ? "bg-rose-50 border-rose-200 text-rose-950 dark:bg-rose-950/30 dark:border-rose-900"
              : "bg-card border-border",
          )}
        >
          <p className="text-[10px] uppercase font-medium">Low Stock</p>
          <p className="text-base sm:text-xl font-bold mt-0.5 text-rose-600">
            {initialData.totalLowStock}
          </p>
        </div>
        <div
          onClick={() => setFilter("expiring")}
          className={cn(
            "rounded-xl border p-2 sm:p-3 shadow-xs cursor-pointer transition-all",
            initialData.totalExpiringSoon > 0
              ? "bg-amber-50 border-amber-200 text-amber-950 dark:bg-amber-950/30 dark:border-amber-900"
              : "bg-card border-border",
          )}
        >
          <p className="text-[10px] uppercase font-medium">Expiring</p>
          <p className="text-base sm:text-xl font-bold mt-0.5 text-amber-600">
            {initialData.totalExpiringSoon}
          </p>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search medicines by name, form, strength..."
            className="pl-9 pr-9 h-11 rounded-xl bg-card border-border/80 text-sm shadow-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <Button
            type="button"
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            className="rounded-full px-3.5 h-8 text-xs font-medium shrink-0"
            onClick={() => setFilter("all")}
          >
            All medicines
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filter === "low_stock" ? "default" : "outline"}
            className="rounded-full px-3.5 h-8 text-xs font-medium shrink-0"
            onClick={() => setFilter("low_stock")}
          >
            Low stock ({initialData.totalLowStock})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filter === "expiring" ? "default" : "outline"}
            className="rounded-full px-3.5 h-8 text-xs font-medium shrink-0"
            onClick={() => setFilter("expiring")}
          >
            Expiring ({initialData.totalExpiringSoon + initialData.totalCritical})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filter === "expired" ? "default" : "outline"}
            className="rounded-full px-3.5 h-8 text-xs font-medium shrink-0"
            onClick={() => setFilter("expired")}
          >
            Expired
          </Button>
        </div>
      </div>

      {/* 3. Mobile-Friendly Medicine Cards */}
      <div className="space-y-2.5">
        {filteredMedicines.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
            <Package className="size-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-foreground">No medicines found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {query
                ? `No medicines match "${query}". Try searching another name or reset filters.`
                : "No items match the active filter criteria."}
            </p>
            {(query || filter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Reset filters
              </Button>
            )}
          </div>
        ) : (
          filteredMedicines.map((med) => {
            const unitLabel = stockUnitPlural(med.stockUnit, med.totalOnHand);
            const isCritical = med.status === "CRITICAL" || med.status === "EXPIRED";
            const isWarning = med.status === "LOW_STOCK" || med.status === "EXPIRING";

            return (
              <div
                key={med.id}
                onClick={() => handleOpenDetail(med)}
                className="group flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl border border-border/80 bg-card shadow-xs hover:border-primary/60 hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-bold text-foreground group-hover:text-primary transition-colors truncate">
                      {med.genericName}
                    </h3>
                    <Badge
                      variant={isCritical ? "critical" : isWarning ? "warning" : "success"}
                      className="text-[10px] px-2 py-0 shrink-0 font-medium"
                    >
                      {med.statusLabel}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {[med.strength, med.dosageForm].filter(Boolean).join(" · ")}
                  </p>

                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {med.totalOnHand} {unitLabel}
                    </span>
                    <span>&middot;</span>
                    <span>
                      {med.batchCount} batch{med.batchCount === 1 ? "" : "es"}
                    </span>
                    {med.earliestExpiry && (
                      <>
                        <span>&middot;</span>
                        <span className="truncate">
                          Earliest: {med.earliestExpiry}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs text-primary group-hover:translate-x-0.5 transition-transform"
                  >
                    <span>View</span>
                    <ChevronRight className="size-3.5 ml-0.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Medicine Detail Dialog */}
      <MedicineDetailModal
        medicine={selectedMedicine}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
