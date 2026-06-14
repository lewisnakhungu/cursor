"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { MedicineCatalogSearch } from "@/components/catalog/medicine-catalog-search";
import { StockUnitSelect } from "@/components/ui/stock-unit-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { bulkMatchCatalog } from "@/lib/actions/catalog";
import { receiveBulkInventory } from "@/lib/actions/inventory";
import {
  CSV_TEMPLATE,
  rowsToImportedLineItems,
} from "@/lib/receive/csv-import";
import {
  suggestStockUnitFromDosageForm,
  type StockUnitCode,
} from "@/lib/stock-unit";
import type {
  CatalogMedicine,
  MatchConfidence,
  ValidatedInventoryItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type ReviewRow = {
  id: string;
  rawName: string;
  quantity: string;
  batchNumber: string;
  expiryDate: string;
  supplierCost: string;
  retailPrice: string;
  matchConfidence: MatchConfidence;
  selectedMedicine: CatalogMedicine | null;
  stockUnit: StockUnitCode;
};

function confidenceBadgeVariant(
  confidence: MatchConfidence,
): "success" | "secondary" | "critical" {
  if (confidence === "HIGH") return "success";
  if (confidence === "LOW") return "secondary";
  return "critical";
}

function newRowId(): string {
  return crypto.randomUUID();
}

export function BulkImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [supplierName, setSupplierName] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isMatching, startMatch] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  const updateRow = useCallback(
    (id: string, patch: Partial<ReviewRow>) => {
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const processCsvText = useCallback((text: string) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          toast.error(results.errors[0]?.message ?? "Failed to parse CSV");
          return;
        }

        const imported = rowsToImportedLineItems(results.data);
        if (imported.length === 0) {
          toast.error(
            "No valid rows found. Include Medicine and Quantity columns.",
          );
          return;
        }

        startMatch(async () => {
          const response = await bulkMatchCatalog(
            imported.map((item) => item.rawName),
          );
          if (!response.success) {
            toast.error(response.error);
            return;
          }

          const reviewRows: ReviewRow[] = imported.map((item, index) => {
            const match = response.data[index];
            const medicine = match?.medicine ?? null;
            return {
              id: newRowId(),
              rawName: item.rawName,
              quantity: String(item.quantity),
              batchNumber: item.batchNumber ?? "",
              expiryDate: item.expiryDate ?? "",
              supplierCost:
                item.supplierCost !== undefined
                  ? String(item.supplierCost)
                  : "",
              retailPrice:
                item.retailPrice !== undefined ? String(item.retailPrice) : "",
              matchConfidence: match?.matchConfidence ?? "NONE",
              selectedMedicine: medicine,
              stockUnit: medicine
                ? suggestStockUnitFromDosageForm(medicine.dosageForm)
                : "UNIT",
            };
          });

          setRows(reviewRows);
          toast.success(
            `Imported ${reviewRows.length} line${reviewRows.length === 1 ? "" : "s"} — review matches before receiving`,
          );
        });
      },
    });
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        toast.error("Please upload a .csv file (Excel: Save As → CSV)");
        return;
      }
      file.text().then(processCsvText).catch(() => {
        toast.error("Could not read the file");
      });
    },
    [processCsvText],
  );

  const onFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
    event.target.value = "";
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleSubmit = () => {
    const payload: ValidatedInventoryItem[] = [];
    const sharedSupplier = supplierName.trim() || undefined;

    for (const row of rows) {
      if (!row.selectedMedicine) {
        toast.error(`Match a KEML item for "${row.rawName}"`);
        return;
      }

      const qty = Number.parseInt(row.quantity, 10);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error(`Invalid quantity for "${row.rawName}"`);
        return;
      }
      if (!row.expiryDate) {
        toast.error(`Expiry date required for "${row.rawName}"`);
        return;
      }

      const supplierCost =
        row.supplierCost.trim() === ""
          ? undefined
          : Number.parseFloat(row.supplierCost);
      const retailSalePrice =
        row.retailPrice.trim() === ""
          ? undefined
          : Number.parseFloat(row.retailPrice);

      if (
        supplierCost !== undefined &&
        (!Number.isFinite(supplierCost) || supplierCost < 0)
      ) {
        toast.error(`Invalid supplier cost for "${row.rawName}"`);
        return;
      }
      if (
        retailSalePrice !== undefined &&
        (!Number.isFinite(retailSalePrice) || retailSalePrice < 0)
      ) {
        toast.error(`Invalid retail price for "${row.rawName}"`);
        return;
      }

      payload.push({
        medicineId: row.selectedMedicine.id,
        batchNumber: row.batchNumber.trim() || undefined,
        supplierName: sharedSupplier,
        quantityOnHand: qty,
        expiryDate: row.expiryDate,
        stockUnit: row.stockUnit,
        supplierCost,
        retailSalePrice,
      });
    }

    if (payload.length === 0) {
      toast.error("Add at least one row to receive");
      return;
    }

    startSubmit(async () => {
      const response = await receiveBulkInventory(payload);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success(
        `Received ${response.data.count} batch${response.data.count === 1 ? "" : "es"} into stock`,
      );
      setRows([]);
      setSupplierName("");
    });
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "afyasmart-receive-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="bulk-supplier">
            Supplier / vendor (optional, applies to all lines)
          </label>
          <Input
            id="bulk-supplier"
            className="h-11"
            placeholder="e.g. KEMSA"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={downloadTemplate}
          >
            <FileSpreadsheet className="mr-2 size-4" aria-hidden />
            Download CSV template
          </Button>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragActive
            ? "border-primary bg-primary/5"
            : "border-border/80 bg-muted/20 hover:border-primary/40 hover:bg-muted/40",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={onFileInput}
          disabled={isMatching || isSubmitting}
        />
        {isMatching ? (
          <Loader2 className="mb-3 size-10 animate-spin text-primary" aria-hidden />
        ) : (
          <Upload className="mb-3 size-10 text-primary" aria-hidden />
        )}
        <p className="text-sm font-semibold">
          {isMatching ? "Matching to KEML…" : "Drop a CSV file here or click to browse"}
        </p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          Columns: Medicine, Quantity, Batch, Expiry, Supplier Cost, Retail
          Price. Excel files: use Save As → CSV first.
        </p>
      </div>

      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-border/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CSV name</TableHead>
                  <TableHead className="min-w-[240px]">KEML match</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Retail</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[140px] whitespace-normal font-medium">
                      {row.rawName}
                      <Badge
                        variant={confidenceBadgeVariant(row.matchConfidence)}
                        className="ml-2 text-[10px]"
                      >
                        {row.matchConfidence}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <div className="min-w-[220px] space-y-2">
                        {row.selectedMedicine ? (
                          <p className="text-xs font-medium text-foreground">
                            {row.selectedMedicine.genericName} ·{" "}
                            {row.selectedMedicine.dosageForm}{" "}
                            {row.selectedMedicine.strength}
                          </p>
                        ) : (
                          <p className="text-xs text-destructive">
                            No match — search below
                          </p>
                        )}
                        <MedicineCatalogSearch
                          inputId={`bulk-match-${row.id}`}
                          placeholder="Override or search KEML…"
                          variant="receive"
                          disabled={isSubmitting}
                          onSelect={(medicine) =>
                            updateRow(row.id, {
                              selectedMedicine: medicine,
                              matchConfidence: "HIGH",
                              stockUnit: suggestStockUnitFromDosageForm(
                                medicine.dosageForm,
                              ),
                            })
                          }
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        className="h-9 w-20"
                        value={row.quantity}
                        disabled={isSubmitting}
                        onChange={(e) =>
                          updateRow(row.id, { quantity: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-9 w-28"
                        value={row.batchNumber}
                        disabled={isSubmitting}
                        onChange={(e) =>
                          updateRow(row.id, { batchNumber: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        className="h-9 w-36"
                        value={row.expiryDate}
                        disabled={isSubmitting}
                        onChange={(e) =>
                          updateRow(row.id, { expiryDate: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-9 w-24"
                        value={row.supplierCost}
                        disabled={isSubmitting}
                        onChange={(e) =>
                          updateRow(row.id, { supplierCost: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-9 w-24"
                        value={row.retailPrice}
                        disabled={isSubmitting}
                        onChange={(e) =>
                          updateRow(row.id, { retailPrice: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <StockUnitSelect
                        value={row.stockUnit}
                        disabled={isSubmitting || !row.selectedMedicine}
                        onChange={(unit) => updateRow(row.id, { stockUnit: unit })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        aria-label={`Remove ${row.rawName}`}
                        disabled={isSubmitting}
                        onClick={() => removeRow(row.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {rows.length} line{rows.length === 1 ? "" : "s"} ready for review
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setRows([])}
              >
                Clear grid
              </Button>
              <Button
                type="button"
                size="lg"
                disabled={isSubmitting || isMatching}
                onClick={handleSubmit}
              >
                {isSubmitting ? "Receiving…" : "Confirm & receive"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
