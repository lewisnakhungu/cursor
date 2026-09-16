"use client";

import { CheckCircle2, Printer, Share2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatKes } from "@/lib/money";
import { formatQuantityWithUnit, normalizeStockUnit } from "@/lib/stock-unit";
import type { AnyReceipt } from "@/components/pos/dispense-receipt";
import { BRAND_NAME } from "@/lib/brand";

function isOfflineReceipt(r: AnyReceipt): boolean {
  return "isOffline" in r && r.isOffline === true;
}

export function DispenseCompletionScreen({
  receipt,
  onNewSale,
}: {
  receipt: AnyReceipt;
  onNewSale: () => void;
}) {
  const offline = isOfflineReceipt(receipt);
  const saleId = offline
    ? (receipt as { localId: string }).localId
    : (receipt as { saleId: string }).saleId;
  const totalAmount = receipt.totalAmount;
  const lineCount = receipt.lines.length;

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const summary = `${BRAND_NAME} Receipt\nSale #${saleId.slice(-6).toUpperCase()}\nAmount: ${formatKes(totalAmount)}\nItems: ${lineCount}\nThank you!`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${BRAND_NAME} Sale Receipt`,
          text: summary,
        });
        toast.success("Receipt shared");
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(summary);
      toast.success("Receipt summary copied to clipboard");
    }
  };

  return (
    <div className="max-w-md mx-auto my-4 p-5 sm:p-6 rounded-2xl border bg-card shadow-sm space-y-6 text-center">
      {/* 1. Success Indicator */}
      <div className="flex flex-col items-center">
        <div className="size-16 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
          <CheckCircle2 className="size-10" />
        </div>
        <h2 className="text-xl font-extrabold text-foreground">
          {offline ? "Sale Saved (Offline)" : "Dispense Complete!"}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {offline
            ? "Recorded in local storage — will sync automatically when online"
            : "Inventory updated and stock movement logged to audit ledger"}
        </p>
      </div>

      {/* 2. Big Total Amount */}
      <div className="p-4 rounded-xl bg-muted/30 border text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Total Dispensed
        </p>
        <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground font-mono mt-1">
          {formatKes(totalAmount)}
        </p>
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>Sale #{saleId.slice(-6).toUpperCase()}</span>
          <span>&middot;</span>
          <span>{lineCount} item{lineCount === 1 ? "" : "s"}</span>
          <span>&middot;</span>
          <span>
            {new Date(receipt.createdAt).toLocaleTimeString("en-KE", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* 3. Items Summary */}
      <div className="rounded-xl border divide-y text-left text-xs">
        {receipt.lines.map((line, idx) => {
          const unit = normalizeStockUnit(line.stockUnit);
          return (
            <div key={idx} className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate">
                  {line.genericName}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatQuantityWithUnit(line.quantity, unit, line.unitsPerPack)} &times; {formatKes(line.unitPrice)}
                </p>
              </div>
              <span className="font-bold text-foreground font-mono shrink-0">
                {formatKes(line.lineTotal)}
              </span>
            </div>
          );
        })}
      </div>

      {/* 4. Primary & Secondary Actions */}
      <div className="space-y-2 pt-2">
        <Button
          size="lg"
          className="w-full h-12 text-sm font-bold gap-2 shadow-xs"
          onClick={onNewSale}
        >
          <ShoppingCart className="size-4" />
          <span>Start New Sale</span>
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-11 text-xs font-semibold gap-1.5 bg-card"
            onClick={handlePrint}
          >
            <Printer className="size-3.5" />
            <span>Print Receipt</span>
          </Button>

          <Button
            variant="outline"
            className="h-11 text-xs font-semibold gap-1.5 bg-card"
            onClick={handleShare}
          >
            <Share2 className="size-3.5" />
            <span>Share Receipt</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
