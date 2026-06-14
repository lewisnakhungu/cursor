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
import {
  bulkImportProcurementLines,
  createProcurementDraft,
} from "@/lib/actions/procurement";
import {
  downloadProcurementCsvTemplate,
  downloadProcurementExcelTemplate,
} from "@/lib/procurement/order-import";
import {
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
} from "@/lib/types";
import { cn } from "@/lib/utils";

type IntakeMode = "file" | "paste" | "scan";

type ReviewRow = {
  id: string;
  rawName: string;
  quantity: string;
  matchConfidence: MatchConfidence;
  selectedMedicine: CatalogMedicine | null;
  stockUnit: StockUnitCode;
};

type ProcurementImportFormProps = {
  orderId: string | null;
  orderIsDraft: boolean;
  onImported: (orderId: string) => void;
  disabled?: boolean;
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
      matchConfidence: match?.matchConfidence ?? "NONE",
      selectedMedicine: medicine,
      stockUnit: medicine
        ? suggestStockUnitFromDosageForm(medicine.dosageForm)
        : "UNIT",
    };
  });
}

export function ProcurementImportForm({
  orderId,
  orderIsDraft,
  onImported,
  disabled = false,
}: ProcurementImportFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("file");
  const [pasteText, setPasteText] = useState("");
  const [scanPreview, setScanPreview] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isMatching, startMatch] = useTransition();
  const [isScanning, startScan] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  const canImportToOrder = !orderId || orderIsDraft;
  const busy = disabled || isMatching || isScanning || isSubmitting;

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
        `Parsed ${imported.length} line${imported.length === 1 ? "" : "s"} — review KEML matches before adding`,
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

  const resolveOrderId = async (): Promise<string | null> => {
    if (orderId && orderIsDraft) return orderId;
    if (orderId && !orderIsDraft) {
      toast.error("Open or create a draft order before importing");
      return null;
    }
    const created = await createProcurementDraft({
      notes: "Imported from partner list",
    });
    if (!created.success) {
      toast.error(created.error);
      return null;
    }
    return created.data.orderId;
  };

  const handleSubmit = () => {
    if (!canImportToOrder) {
      toast.error("Select a draft order or create a new one to import into");
      return;
    }

    const payload: Array<{
      medicineId: string;
      orderedQty: number;
      stockUnit: StockUnitCode;
      rawName: string;
    }> = [];

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

      payload.push({
        medicineId: row.selectedMedicine.id,
        orderedQty: qty,
        stockUnit: row.stockUnit,
        rawName: row.rawName,
      });
    }

    if (payload.length === 0) {
      toast.error("Add at least one line to import");
      return;
    }

    startSubmit(async () => {
      const targetOrderId = await resolveOrderId();
      if (!targetOrderId) return;

      const response = await bulkImportProcurementLines({
        orderId: targetOrderId,
        lines: payload,
      });
      if (!response.success) {
        toast.error(response.error);
        return;
      }

      const { added, skipped } = response.data;
      toast.success(
        `Added ${added} line${added === 1 ? "" : "s"} to order` +
          (skipped > 0 ? ` (${skipped} duplicate${skipped === 1 ? "" : "s"} skipped)` : ""),
      );
      setRows([]);
      setPasteText("");
      setScanPreview("");
      onImported(targetOrderId);
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border/80 bg-muted/10 p-4">
      <div>
        <h3 className="text-sm font-semibold">Import partner list</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a CSV or Excel file from KEMSA or a wholesaler, paste a printed
          list, or photograph a supplier order form. Lines are matched to KEML
          before joining the draft order.
        </p>
        {!canImportToOrder ? (
          <p className="mt-2 text-sm text-amber-800">
            The selected order is submitted — create a new draft to import into.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={downloadProcurementCsvTemplate}
          disabled={busy}
        >
          <FileSpreadsheet className="mr-2 size-4" aria-hidden />
          CSV template
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={downloadProcurementExcelTemplate}
          disabled={busy}
        >
          <FileSpreadsheet className="mr-2 size-4" aria-hidden />
          Excel template
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={intakeMode === "file" ? "default" : "outline"}
          size="sm"
          className="gap-2"
          onClick={() => setIntakeMode("file")}
          disabled={busy}
        >
          <Upload className="size-4" aria-hidden />
          CSV / Excel
        </Button>
        <Button
          type="button"
          variant={intakeMode === "paste" ? "default" : "outline"}
          size="sm"
          className="gap-2"
          onClick={() => setIntakeMode("paste")}
          disabled={busy}
        >
          <ClipboardPaste className="size-4" aria-hidden />
          Paste list
        </Button>
        <Button
          type="button"
          variant={intakeMode === "scan" ? "default" : "outline"}
          size="sm"
          className="gap-2"
          onClick={() => setIntakeMode("scan")}
          disabled={busy}
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
            "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border/80 bg-background hover:border-primary/40",
            busy && "pointer-events-none opacity-60",
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
            <Loader2 className="mb-2 size-8 animate-spin text-primary" aria-hidden />
          ) : (
            <Upload className="mb-2 size-8 text-primary" aria-hidden />
          )}
          <p className="text-sm font-medium">
            {isMatching ? "Matching to KEML…" : "Drop CSV or Excel here"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Columns: Medicine (or Product), Quantity
          </p>
        </div>
      )}

      {intakeMode === "paste" && (
        <div className="space-y-3">
          <textarea
            className="min-h-32 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder={`Medicine,Quantity\nParacetamol 500mg,100\n\n—or—\n\nParacetamol 500mg tabs 100\n50 x Metformin 500mg`}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            disabled={busy}
          />
          <Button
            type="button"
            size="sm"
            onClick={handlePasteSubmit}
            disabled={busy || pasteText.trim().length === 0}
          >
            {isMatching ? "Matching…" : "Parse pasted list"}
          </Button>
        </div>
      )}

      {intakeMode === "scan" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Photograph a printed supplier or KEMSA order list. Flat page, good
            lighting. You review every line before it is added.
          </p>
          <div
            role="button"
            tabIndex={0}
            onClick={() => scanInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") scanInputRef.current?.click();
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center hover:bg-muted/30",
              busy && "pointer-events-none opacity-60",
            )}
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
          {scanPreview ? (
            <div className="space-y-2">
              <label className="text-xs font-medium" htmlFor="procurement-scan-preview">
                Extracted text (edit before matching)
              </label>
              <textarea
                id="procurement-scan-preview"
                className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs"
                value={scanPreview}
                onChange={(e) => setScanPreview(e.target.value)}
                disabled={busy}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleScanPreviewSubmit}
                disabled={busy || scanPreview.trim().length === 0}
              >
                Re-parse edited text
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {rows.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Imported name</TableHead>
                  <TableHead className="min-w-[220px]">KEML match</TableHead>
                  <TableHead>Order qty</TableHead>
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
                      <div className="min-w-[200px] space-y-2">
                        {row.selectedMedicine ? (
                          <p className="text-xs font-medium">
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
                          inputId={`proc-import-${row.id}`}
                          placeholder="Search KEML…"
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
              {rows.length} line{rows.length === 1 ? "" : "s"} ready
              {orderId && orderIsDraft
                ? " — will merge into current draft"
                : " — will create a new draft order"}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={() => setRows([])}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || !canImportToOrder}
                onClick={handleSubmit}
              >
                {isSubmitting ? "Adding…" : "Add to order"}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
