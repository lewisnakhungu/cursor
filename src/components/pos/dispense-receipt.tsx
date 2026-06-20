"use client";

import { useRef } from "react";
import { WifiOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatKes } from "@/lib/money";
import {
  formatPricePerUnitLabel,
  formatQuantityWithUnit,
  normalizeStockUnit,
} from "@/lib/stock-unit";
import type { DispenseResult } from "@/lib/types";
import type { LocalDispenseReceipt } from "@/lib/offline/types";
import { BRAND_NAME, getDefaultFacilityLabel } from "@/lib/brand";

/**
 * DispenseReceipt accepts either:
 *  - a server-confirmed DispenseResult  (online path)
 *  - a LocalDispenseReceipt             (offline path, pending sync)
 */
export type AnyReceipt = DispenseResult | LocalDispenseReceipt;

type DispenseReceiptProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: AnyReceipt | null;
};

function isOfflineReceipt(r: AnyReceipt): r is LocalDispenseReceipt {
  return (r as LocalDispenseReceipt).isOffline === true;
}

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function DispenseReceipt({
  open,
  onOpenChange,
  receipt,
}: DispenseReceiptProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!receipt) return null;

  const offline = isOfflineReceipt(receipt);
  const saleId = offline ? receipt.localId : receipt.saleId;
  const totalAmount = receipt.totalAmount;

  const handlePrint = () => window.print();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md print:hidden">
        <DialogHeader>
          <DialogTitle>
            {offline ? "Sale saved (offline)" : "Dispense complete"}
          </DialogTitle>
          <DialogDescription>
            {offline
              ? `${saleId} · ${formatKes(totalAmount)} · Will sync when online`
              : `Sale ${saleId.slice(0, 8)}… · ${formatKes(totalAmount)}`}
          </DialogDescription>
        </DialogHeader>

        {/* Offline sync banner */}
        {offline && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <strong>Offline sale recorded.</strong> This sale will be
              submitted to the server automatically when your device reconnects.
              The receipt ID will update to a permanent sale number.
            </p>
          </div>
        )}

        <div
          ref={printRef}
          className="thermal-receipt mx-auto rounded border bg-white p-4 font-mono text-black"
        >
          {offline ? (
            <OfflineReceiptBody receipt={receipt} />
          ) : (
            <OnlineReceiptBody receipt={receipt} />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handlePrint} disabled={offline}>
            {offline ? "Print when synced" : "Print receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Print-only thermal receipt — only for confirmed online sales */}
      {!offline && (
        <div className="thermal-receipt-print hidden print:block">
          <OnlineReceiptBody receipt={receipt as DispenseResult} />
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Online receipt (server-confirmed)
// ---------------------------------------------------------------------------

function OnlineReceiptBody({ receipt }: { receipt: DispenseResult }) {
  const activeLines = receipt.lines.filter((l) => l.status === "ACTIVE");
  return (
    <ReceiptShell
      saleId={`Sale: ${receipt.saleId.slice(0, 12)}`}
      timestamp={receipt.createdAt}
      isOffline={false}
    >
      {activeLines.map((line) => {
        const unit = normalizeStockUnit(line.stockUnit);
        return (
          <div key={line.id} className="text-xs leading-snug">
            <p className="font-semibold">{line.genericName}</p>
            <p>
              {line.dosageForm} · {line.strength}
            </p>
            <p>Batch: {line.batchNumber ?? "N/A"}</p>
            <p>{formatQuantityWithUnit(line.quantity, unit, line.unitsPerPack)}</p>
            <p>
              {formatPricePerUnitLabel(line.unitPrice, unit)} →{" "}
              <span className="font-semibold">{formatKes(line.lineTotal)}</span>
            </p>
          </div>
        );
      })}
      <p className="mt-3 border-t border-dashed border-black pt-2 text-right text-sm font-bold">
        TOTAL {formatKes(receipt.totalAmount)}
      </p>
      <p className="mt-3 text-center text-xs font-semibold">
        *** DISPENSED — VERIFY BEFORE USE ***
      </p>
      <p className="mt-1 text-center text-[10px]">{activeLines.length} item(s)</p>
    </ReceiptShell>
  );
}

// ---------------------------------------------------------------------------
// Offline receipt (pending sync)
// ---------------------------------------------------------------------------

function OfflineReceiptBody({ receipt }: { receipt: LocalDispenseReceipt }) {
  return (
    <ReceiptShell
      saleId={`Ref: ${receipt.localId}`}
      timestamp={receipt.createdAt}
      isOffline
    >
      {receipt.lines.map((line, i) => {
        const unit = normalizeStockUnit(line.stockUnit);
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="text-xs leading-snug">
            <p className="font-semibold">{line.genericName}</p>
            <p>
              {line.dosageForm} · {line.strength}
            </p>
            {line.batchNumber && <p>Batch: {line.batchNumber}</p>}
            <p>{formatQuantityWithUnit(line.quantity, unit, line.unitsPerPack)}</p>
            {line.unitPrice > 0 && (
              <p>
                {formatPricePerUnitLabel(line.unitPrice, unit)} →{" "}
                <span className="font-semibold">{formatKes(line.lineTotal)}</span>
              </p>
            )}
          </div>
        );
      })}
      <p className="mt-3 border-t border-dashed border-black pt-2 text-right text-sm font-bold">
        TOTAL {formatKes(receipt.totalAmount)}
      </p>
      <p className="mt-3 text-center text-xs font-semibold">
        *** OFFLINE — PENDING SERVER SYNC ***
      </p>
      <p className="mt-1 text-center text-[10px]">{receipt.lines.length} item(s)</p>
    </ReceiptShell>
  );
}

// ---------------------------------------------------------------------------
// Shared receipt shell
// ---------------------------------------------------------------------------

function ReceiptShell({
  saleId,
  timestamp,
  isOffline,
  children,
}: {
  saleId: string;
  timestamp: string;
  isOffline: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <p className="text-center text-sm font-bold uppercase tracking-wider">
        {getDefaultFacilityLabel()}
      </p>
      <p className="mt-1 text-center text-xs">{BRAND_NAME} POS</p>
      <p className="mt-2 border-b border-dashed border-black pb-2 text-center text-xs">
        {isOffline ? "OFFLINE DISPENSE RECEIPT" : "DISPENSE RECEIPT"}
      </p>
      <p className="mt-2 text-xs">
        {saleId}
        <br />
        {formatTimestamp(timestamp)}
        {isOffline && (
          <>
            <br />
            <span className="font-semibold">⚠ Sync pending</span>
          </>
        )}
      </p>
      <div className="mt-3 space-y-2 border-t border-dashed border-black pt-2">
        {children}
      </div>
    </>
  );
}
