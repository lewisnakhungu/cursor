"use client";

import {
  formatQuantityWithUnit,
  stockUnitMeta,
} from "@/lib/stock-unit";
import type { ProcurementReportData } from "@/lib/types";
import {
  ReportPrintLayout,
  ReportSection,
  ReportTable,
} from "@/components/reports/report-print-layout";

export function ProcurementOrderDocument({ data }: { data: ProcurementReportData }) {
  return (
    <ReportPrintLayout
      title={data.reportTitle}
      subtitle="Procurement requisition — review before sending to supplier"
      facilityName={data.facilityName}
      generatedAt={data.generatedAt}
    >
      <ReportSection title="Order details">
        <div className="grid gap-2 text-sm">
          <p>
            <span className="font-semibold">Reference:</span> {data.reference}
          </p>
          <p>
            <span className="font-semibold">Status:</span> {data.status}
          </p>
          <p>
            <span className="font-semibold">Supplier:</span>{" "}
            {data.supplierName ?? "___________________________"}
          </p>
          {data.notes ? (
            <p>
              <span className="font-semibold">Notes:</span> {data.notes}
            </p>
          ) : null}
        </div>
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-600">
              Prepared by
            </p>
            <div className="mt-8 border-b border-neutral-400" />
            <p className="mt-1 text-xs text-neutral-600">Signature / date</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-600">
              Approved by (owner / deputy)
            </p>
            <div className="mt-8 border-b border-neutral-400" />
            <p className="mt-1 text-xs text-neutral-600">Signature / date</p>
          </div>
        </div>
      </ReportSection>

      <ReportSection title={`Items to order (${data.lineCount})`}>
        <ReportTable
          headers={[
            "#",
            "Item",
            "ABC",
            "On hand",
            "ROP",
            "Days left",
            "Order qty",
            "Unit",
            "Priority",
            "Notes",
          ]}
          rows={data.lines.map((line, i) => [
            String(i + 1),
            `${line.genericName} — ${line.dosageForm} · ${line.strength}`,
            line.sourceMeta?.abcClass ?? "—",
            line.sourceMeta != null
              ? String(line.sourceMeta.currentStock)
              : "—",
            line.sourceMeta != null
              ? String(line.sourceMeta.reorderPoint)
              : "—",
            line.sourceMeta?.daysOfStockLeft != null
              ? String(line.sourceMeta.daysOfStockLeft)
              : "—",
            String(line.orderedQty),
            stockUnitMeta(line.stockUnit).label,
            line.priority,
            line.notes ?? "",
          ])}
        />
      </ReportSection>

      {data.expiryWatch.length > 0 ? (
        <ReportSection title="Expiry watch — dispense first before reordering">
          <ReportTable
            headers={[
              "Item",
              "Batch",
              "Qty on hand",
              "Expiry",
              "Days",
            ]}
            rows={data.expiryWatch.map((row) => [
              `${row.genericName} — ${row.dosageForm} · ${row.strength}`,
              row.batchNumber ?? "—",
              formatQuantityWithUnit(
                row.quantityOnHand,
                row.stockUnit,
                row.unitsPerPack,
              ),
              row.expiryDate,
              String(row.daysUntilExpiry),
            ])}
          />
        </ReportSection>
      ) : null}
    </ReportPrintLayout>
  );
}
