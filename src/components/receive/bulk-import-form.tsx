"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Camera,
  ClipboardPaste,
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
  buildExcelTemplateBlob,
  CSV_TEMPLATE,
  parseCsvText,
  parseExcelArrayBuffer,
  parsePastedDeliveryText,
  parsePrintedLineItems,
  scanPrintedListImage,
} from "@/lib/receive/delivery-import";
import {
  suggestStockUnitFromDosageForm,
  type StockUnitCode,
} from "@/lib/stock-unit";
import type {
  BulkCatalogMatch,
  CatalogMedicine,
  ImportedLineItem,
  MatchConfidence,
  ValidatedInventoryItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type IntakeMode = "file" | "paste" | "scan";

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

function importedToReviewRows(
  imported: ImportedLineItem[],
  matches: BulkCatalogMatch[],
): ReviewRow[] {
  return imported.map((item, index) => {
    const match = matches[index];
    const medicine = match?.medicine ?? null;
    return {
      id: newRowId(),
      rawName: item.rawName,
      quantity: String(item.quantity),
      batchNumber: item.batchNumber ?? "",
      expiryDate: item.expiryDate ?? "",
      supplierCost:
        item.supplierCost !== undefined ? String(item.supplierCost) : "",
      retailPrice: item.retailPrice !== undefined ? String(item.retailPrice) : "",
      matchConfidence: match?.matchConfidence ?? "NONE",
      selectedMedicine: medicine,
      stockUnit: medicine
        ? suggestStockUnitFromDosageForm(medicine.dosageForm)
        : "UNIT",
    };
  });
}

export function BulkImportForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("file");
  const [supplierName, setSupplierName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [scanPreview, setScanPreview] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isMatching, startMatch] = useTransition();
  const [isScanning, startScan] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  const updateRow = useCallback((id: string, patch: Partial<ReviewRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const loadImportedItems = useCallback((imported: ImportedLineItem[]) => {
    if (imported.length === 0) {
      toast.error("No valid lines found — check medicine names and quantities");
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

      setRows(importedToReviewRows(imported, response.data));
      toast.success(
        `Imported ${imported.length} line${imported.length === 1 ? "" : "s"} — review matches before receiving`,
      );
    });
  }, []);

  const processCsvText = useCallback(
    (text: string) => {
      try {
        loadImportedItems(parseCsvText(text));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to parse CSV",
        );
      }
    },
    [loadImportedItems],
  );

  const handleSpreadsheetFile = useCallback(
    async (file: File) => {
      const lower = file.name.toLowerCase();

      if (lower.endsWith(".csv")) {
        file
          .text()
          .then(processCsvText)
          .catch(() => toast.error("Could not read the CSV file"));
        return;
      }

      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        try {
          const buffer = await file.arrayBuffer();
          loadImportedItems(parseExcelArrayBuffer(buffer));
        } catch {
          toast.error("Could not read the Excel file");
        }
        return;
      }

      toast.error("Upload a .csv, .xlsx, or .xls file");
    },
    [loadImportedItems, processCsvText],
  );

  const onFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleSpreadsheetFile(file);
    event.target.value = "";
  };

  const onScanInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleScanFile(file);
    event.target.value = "";
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleSpreadsheetFile(file);
  };

  const handlePasteSubmit = () => {
    loadImportedItems(parsePastedDeliveryText(pasteText));
  };

  const handleScanFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Upload a photo of the printed list (JPG or PNG)");
      return;
    }

    startScan(async () => {
      try {
        const text = await scanPrintedListImage(file);
        setScanPreview(text);
        const imported = parsePrintedLineItems(text);
        if (imported.length === 0) {
          toast.error(
            "Could not detect any lines — edit the extracted text below or paste manually",
          );
          return;
        }
        loadImportedItems(imported);
      } catch {
        toast.error("Scan failed — try better lighting or paste the list instead");
      }
    });
  };

  const handleScanPreviewSubmit = () => {
    loadImportedItems(parsePrintedLineItems(scanPreview));
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
      setPasteText("");
      setScanPreview("");
    });
  };

  const downloadCsvTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "afyasmart-receive-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcelTemplate = () => {
    const blob = buildExcelTemplateBlob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "afyasmart-receive-template.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const busy = isMatching || isScanning || isSubmitting;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
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
            disabled={busy}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={downloadCsvTemplate}
            disabled={busy}
          >
            <FileSpreadsheet className="mr-2 size-4" aria-hidden />
            CSV template
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={downloadExcelTemplate}
            disabled={busy}
          >
            <FileSpreadsheet className="mr-2 size-4" aria-hidden />
            Excel template
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={intakeMode === "file" ? "default" : "outline"}
          className="gap-2"
          onClick={() => setIntakeMode("file")}
        >
          <Upload className="size-4" aria-hidden />
          CSV / Excel file
        </Button>
        <Button
          type="button"
          variant={intakeMode === "paste" ? "default" : "outline"}
          className="gap-2"
          onClick={() => setIntakeMode("paste")}
        >
          <ClipboardPaste className="size-4" aria-hidden />
          Paste printed list
        </Button>
        <Button
          type="button"
          variant={intakeMode === "scan" ? "default" : "outline"}
          className="gap-2"
          onClick={() => setIntakeMode("scan")}
        >
          <Camera className="size-4" aria-hidden />
          Scan photo
        </Button>
      </div>

      {intakeMode === "file" && (
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
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="sr-only"
            onChange={onFileInput}
            disabled={busy}
          />
          {isMatching ? (
            <Loader2 className="mb-3 size-10 animate-spin text-primary" aria-hidden />
          ) : (
            <Upload className="mb-3 size-10 text-primary" aria-hidden />
          )}
          <p className="text-sm font-semibold">
            {isMatching
              ? "Matching to KEML…"
              : "Drop CSV or Excel here, or click to browse"}
          </p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Supports .csv, .xlsx, and .xls with columns Medicine, Quantity,
            Batch, Expiry, Supplier Cost, Retail Price.
          </p>
        </div>
      )}

      {intakeMode === "paste" && (
        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-4">
          <p className="text-sm text-muted-foreground">
            Paste a delivery list copied from email, Word, or a PDF with
            selectable text. One item per line works too, e.g.{" "}
            <span className="font-mono text-foreground">Paracetamol 500mg 100</span>.
          </p>
          <textarea
            className="min-h-40 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder={`Medicine,Quantity\nParacetamol 500mg,100\nAmoxicillin 250mg,50\n\n—or—\n\nParacetamol 500mg tabs 100\n50 x Metformin 500mg`}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            disabled={busy}
          />
          <Button
            type="button"
            onClick={handlePasteSubmit}
            disabled={busy || pasteText.trim().length === 0}
          >
            {isMatching ? "Matching…" : "Parse pasted list"}
          </Button>
        </div>
      )}

      {intakeMode === "scan" && (
        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-4">
          <p className="text-sm text-muted-foreground">
            Photograph a <strong>printed</strong> delivery note or supplier list
            (not handwritten — accuracy is poor). Good lighting and a flat page
            work best. You will review every line before receiving.
          </p>
          <div
            role="button"
            tabIndex={0}
            onClick={() => scanInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") scanInputRef.current?.click();
            }}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center hover:bg-muted/30"
          >
            <input
              ref={scanInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              onChange={onScanInput}
              disabled={busy}
            />
            {isScanning ? (
              <Loader2 className="mb-2 size-8 animate-spin text-primary" aria-hidden />
            ) : (
              <Camera className="mb-2 size-8 text-primary" aria-hidden />
            )}
            <p className="text-sm font-medium">
              {isScanning ? "Reading photo…" : "Take or upload photo"}
            </p>
          </div>
          {scanPreview && (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="scan-preview">
                Extracted text (edit before matching)
              </label>
              <textarea
                id="scan-preview"
                className="min-h-32 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs"
                value={scanPreview}
                onChange={(e) => setScanPreview(e.target.value)}
                disabled={busy}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleScanPreviewSubmit}
                disabled={busy || scanPreview.trim().length === 0}
              >
                Re-parse edited text
              </Button>
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-border/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Imported name</TableHead>
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
                disabled={busy}
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
