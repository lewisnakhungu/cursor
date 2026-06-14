"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Package, Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { searchCatalog } from "@/lib/actions/catalog";
import type { CatalogMedicine } from "@/lib/types";
import { cn } from "@/lib/utils";

export type MedicineCatalogSearchVariant = "dispense" | "receive";

type MedicineCatalogSearchProps = {
  inputId?: string;
  placeholder?: string;
  /** Dispense: stock badges, in-stock first, block out-of-stock picks. */
  variant?: MedicineCatalogSearchVariant;
  onSelect: (medicine: CatalogMedicine) => void;
  disabled?: boolean;
  className?: string;
};

function formulationLabel(medicine: CatalogMedicine): string {
  const parts = [medicine.dosageForm, medicine.strength].filter(Boolean);
  return parts.join(" · ");
}

function CatalogResultRow({ medicine }: { medicine: CatalogMedicine }) {
  const stock = medicine.stock;
  const formulation = formulationLabel(medicine);

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-medium leading-snug">
          {medicine.genericName}
        </span>
        {stock ? (
          stock.hasStock ? (
            <Badge variant="success" className="gap-1 text-[10px] font-normal">
              <Package className="size-3 shrink-0" aria-hidden />
              {stock.summary}
              {stock.batchCount > 1
                ? ` · ${stock.batchCount} batches`
                : null}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] font-normal text-muted-foreground"
            >
              Not in stock
            </Badge>
          )
        ) : null}
        {medicine.matchedBrand ? (
          <Badge variant="secondary" className="text-[10px] font-normal">
            Brand: {medicine.matchedBrand}
          </Badge>
        ) : null}
        {medicine.itemType === "NON_PHARM" ? (
          <Badge variant="outline" className="text-[10px] font-normal">
            Non-pharm
          </Badge>
        ) : null}
      </div>
      {formulation ? (
        <span className="text-xs text-muted-foreground">{formulation}</span>
      ) : null}
    </div>
  );
}

export function MedicineCatalogSearch({
  inputId = "catalog-search",
  placeholder,
  variant = "receive",
  onSelect,
  disabled = false,
  className,
}: MedicineCatalogSearchProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogMedicine[]>([]);
  const [isSearching, startSearch] = useTransition();

  const withStock = variant === "dispense";
  const resolvedPlaceholder =
    placeholder ??
    (withStock
      ? "Search e.g. paracetamol — see which formulations are in stock"
      : "Search medicine (min 2 characters)…");

  const runSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (value.trim().length < 2) {
        setResults([]);
        return;
      }

      startSearch(async () => {
        const response = await searchCatalog(value, { withStock });
        setResults(response.success ? response.data : []);
      });
    },
    [withStock],
  );

  const handleSelect = (medicine: CatalogMedicine) => {
    if (withStock && medicine.stock && !medicine.stock.hasStock) {
      return;
    }
    onSelect(medicine);
    setQuery("");
    setResults([]);
    wrapperRef.current?.querySelector("input")?.focus();
  };

  const inStock = withStock
    ? results.filter((m) => m.stock?.hasStock)
    : results;
  const outOfStock = withStock
    ? results.filter((m) => !m.stock?.hasStock)
    : [];

  const inStockByGeneric = new Map<string, CatalogMedicine[]>();
  for (const medicine of inStock) {
    const list = inStockByGeneric.get(medicine.genericName) ?? [];
    list.push(medicine);
    inStockByGeneric.set(medicine.genericName, list);
  }

  const showGenericHint =
    withStock &&
    query.trim().length >= 2 &&
    Array.from(inStockByGeneric.values()).some((list) => list.length > 1);

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <Command
        shouldFilter={false}
        className="overflow-hidden rounded-xl border border-border/80 bg-background shadow-sm"
      >
        <div className="flex items-center border-b border-border/60 px-3">
          <Search className="size-5 shrink-0 text-primary" aria-hidden />
          <CommandInput
            id={inputId}
            placeholder={resolvedPlaceholder}
            value={query}
            onValueChange={runSearch}
            disabled={disabled}
            className="h-12 flex-1 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
          />
        </div>
        <CommandList className="max-h-80">
          {isSearching && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Searching formulary{withStock ? " and stock" : ""}…
            </div>
          )}
          {!isSearching && query.length >= 2 && results.length === 0 && (
            <CommandEmpty className="py-6 text-sm">
              No medicines found. Try generic name, brand name, or spelling
              variant.
            </CommandEmpty>
          )}
          {query.length > 0 && query.length < 2 && (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Type at least 2 characters
            </p>
          )}
          {showGenericHint && (
            <p className="border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">
              Multiple formulations match — green tags show what you can
              dispense now.
            </p>
          )}
          {inStock.length > 0 && (
            <CommandGroup
              heading={
                withStock ? "In stock — pick formulation" : "Catalog matches"
              }
            >
              {inStock.map((medicine) => (
                <CommandItem
                  key={medicine.id}
                  value={medicine.id}
                  onSelect={() => handleSelect(medicine)}
                  disabled={disabled}
                  className="min-h-11 cursor-pointer py-2.5 aria-selected:bg-primary/10"
                >
                  <CatalogResultRow medicine={medicine} />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {outOfStock.length > 0 && (
            <CommandGroup heading="Formulary only (not in stock)">
              {outOfStock.map((medicine) => (
                <CommandItem
                  key={medicine.id}
                  value={medicine.id}
                  onSelect={() => handleSelect(medicine)}
                  disabled
                  className="min-h-11 cursor-not-allowed py-2.5 opacity-60"
                >
                  <CatalogResultRow medicine={medicine} />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
