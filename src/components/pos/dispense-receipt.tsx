"use client";

import { useRef } from "react";
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

const FACILITY_NAME =
  process.env.NEXT_PUBLIC_FACILITY_NAME ?? "AfyaSmart Facility";

type DispenseReceiptProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: DispenseResult | null;
};

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

  const activeLines = receipt.lines.filter((l) => l.status === "ACTIVE");

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md print:hidden">
        <DialogHeader>
          <DialogTitle>Dispense complete</DialogTitle>
          <DialogDescription>
            Sale {receipt.saleId.slice(0, 8)}… · {formatKes(receipt.totalAmount)}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={printRef}
          className="thermal-receipt mx-auto rounded border bg-white p-4 font-mono text-black"
        >
          <ReceiptBody receipt={receipt} activeLines={activeLines} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handlePrint}>Print receipt</Button>
        </DialogFooter>
      </DialogContent>

      <div className="thermal-receipt-print hidden print:block">
        <ReceiptBody receipt={receipt} activeLines={activeLines} />
      </div>
    </Dialog>
  );
}

function ReceiptBody({
  receipt,
  activeLines,
}: {
  receipt: DispenseResult;
  activeLines: DispenseResult["lines"];
}) {
  return (
    <>
      <p className="text-center text-sm font-bold uppercase tracking-wider">
        {FACILITY_NAME}
      </p>
      <p className="mt-1 text-center text-xs">AfyaSmart-Stock POS</p>
      <p className="mt-2 border-b border-dashed border-black pb-2 text-center text-xs">
        DISPENSE RECEIPT
      </p>
      <p className="mt-2 text-xs">
        Sale: {receipt.saleId.slice(0, 12)}
        <br />
        {formatTimestamp(receipt.createdAt)}
      </p>
      <div className="mt-3 space-y-2 border-t border-dashed border-black pt-2">
        {activeLines.map((line) => {
          const unit = normalizeStockUnit(line.stockUnit);
          return (
            <div key={line.id} className="text-xs leading-snug">
              <p className="font-semibold">{line.genericName}</p>
              <p>
                {line.dosageForm} · {line.strength}
              </p>
              <p>Batch: {line.batchNumber ?? "N/A"}</p>
              <p>
                {formatQuantityWithUnit(
                  line.quantity,
                  unit,
                  line.unitsPerPack,
                )}
              </p>
              <p>
                {formatPricePerUnitLabel(line.unitPrice, unit)} →{" "}
                <span className="font-semibold">
                  {formatKes(line.lineTotal)}
                </span>
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 border-t border-dashed border-black pt-2 text-right text-sm font-bold">
        TOTAL {formatKes(receipt.totalAmount)}
      </p>
      <p className="mt-3 text-center text-xs font-semibold">
        *** DISPENSED — VERIFY BEFORE USE ***
      </p>
      <p className="mt-1 text-center text-[10px]">
        {activeLines.length} item(s)
      </p>
    </>
  );
}
