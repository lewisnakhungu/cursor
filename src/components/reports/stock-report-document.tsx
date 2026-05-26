"use client";

import { formatKes } from "@/lib/money";
import type { StockReportData } from "@/lib/types";
import {
  ReportKpiGrid,
  ReportPrintLayout,
  ReportSection,
  ReportTable,
} from "./report-print-layout";

export function StockReportDocument({ data }: { data: StockReportData }) {
  return (
    <ReportPrintLayout
      title={data.reportTitle}
      subtitle="All non-expired batches with quantity on hand"
      facilityName={data.facilityName}
      generatedAt={data.generatedAt}
    >
      <ReportSection title="Stock overview">
        <ReportKpiGrid
          items={[
            { label: "Active batches", value: String(data.totalBatches) },
            { label: "Total units", value: String(data.totalUnits) },
            {
              label: "Est. retail value",
              value:
                data.estimatedRetailValue > 0
                  ? formatKes(data.estimatedRetailValue)
                  : "—",
            },
            {
              label: "Expiring ≤90d",
              value: String(data.expiringWithin90Count),
            },
          ]}
        />
        {data.lowStockCount > 0 ? (
          <p className="mt-2 text-xs text-neutral-700">
            Low stock batches (≤10 units): {data.lowStockCount}
          </p>
        ) : null}
      </ReportSection>

      <ReportSection title="Stock on hand (FEFO order)">
        <ReportTable
          headers={[
            "Medicine",
            "Batch",
            "Qty",
            "Expiry",
            "Days",
            "Unit price",
            "Value",
            "Notes",
          ]}
          rows={data.rows.map((r) => [
            `${r.genericName} — ${r.dosageForm} · ${r.strength}`,
            r.batchNumber ?? "—",
            String(r.quantityOnHand),
            r.expiryDate,
            String(r.daysUntilExpiry),
            r.retailSalePrice !== null ? formatKes(r.retailSalePrice) : "—",
            r.stockValue !== null ? formatKes(r.stockValue) : "—",
            r.flags.length > 0 ? r.flags.join(", ") : "OK",
          ])}
        />
      </ReportSection>
    </ReportPrintLayout>
  );
}
