"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
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

type MedicineCatalogSearchProps = {
  inputId?: string;
  placeholder?: string;
  onSelect: (medicine: CatalogMedicine) => void;
  disabled?: boolean;
  className?: string;
};

export function MedicineCatalogSearch({
  inputId = "catalog-search",
  placeholder = "Search medicine (min 2 characters)…",
  onSelect,
  disabled = false,
  className,
}: MedicineCatalogSearchProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogMedicine[]>([]);
  const [isSearching, startSearch] = useTransition();

  const runSearch = useCallback((value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    startSearch(async () => {
      const response = await searchCatalog(value);
      setResults(response.success ? response.data : []);
    });
  }, []);

  const handleSelect = (medicine: CatalogMedicine) => {
    onSelect(medicine);
    setQuery("");
    setResults([]);
    wrapperRef.current?.querySelector("input")?.focus();
  };

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <Command
        shouldFilter={false}
        className="overflow-hidden rounded-xl border border-border/80 bg-background shadow-sm"
      >
        <div className="flex items-center border-b border-border/60 px-3">
          <Search
            className="size-5 shrink-0 text-primary"
            aria-hidden
          />
          <CommandInput
            id={inputId}
            placeholder={placeholder}
            value={query}
            onValueChange={runSearch}
            disabled={disabled}
            className="h-12 flex-1 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
          />
        </div>
        <CommandList className="max-h-72">
          {isSearching && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Searching formulary…
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
          {results.length > 0 && (
            <CommandGroup heading="Catalog matches">
              {results.map((medicine) => (
                <CommandItem
                  key={medicine.id}
                  value={medicine.id}
                  onSelect={() => handleSelect(medicine)}
                  disabled={disabled}
                  className="min-h-11 cursor-pointer py-2.5 aria-selected:bg-primary/10"
                >
                  <div className="flex w-full flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-medium leading-snug">
                        {medicine.genericName}
                      </span>
                      {medicine.matchedBrand ? (
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-normal"
                        >
                          Matched brand: {medicine.matchedBrand}
                        </Badge>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {medicine.dosageForm}
                      {medicine.strength ? ` · ${medicine.strength}` : ""}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
