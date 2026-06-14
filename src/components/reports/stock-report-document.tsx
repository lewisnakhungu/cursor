"use client";

import { formatKes } from "@/lib/money";
import {
  formatPricePerUnitShort,
  formatQuantityWithUnit,
  stockUnitMeta,
} from "@/lib/stock-unit";
import type { StockReportData } from "@/lib/types";
import { itemTypeLabel } from "@/lib/report-item-type";
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
      subtitle="All non-expired batches — quantities use each batch's counting unit"
      facilityName={data.facilityName}
      generatedAt={data.generatedAt}
    >
      <ReportSection title="Stock overview">
        <ReportKpiGrid
          items={[
            { label: "Active batches", value: String(data.totalBatches) },
            {
              label: "Total counted items",
              value: String(data.totalUnits),
            },
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
            Low stock batches (≤10 in batch unit): {data.lowStockCount}
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-600">
              {itemTypeLabel("MEDICINE")} stock
            </p>
            <ReportKpiGrid
              items={[
                {
                  label: "Batches",
                  value: String(data.byItemType.medicineBatches),
                },
                {
                  label: "Counted items",
                  value: String(data.byItemType.medicineUnits),
                },
                {
                  label: "Est. retail value",
                  value:
                    data.byItemType.medicineRetailValue > 0
                      ? formatKes(data.byItemType.medicineRetailValue)
                      : "—",
                },
              ]}
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-600">
              {itemTypeLabel("NON_PHARM")} stock
            </p>
            <ReportKpiGrid
              items={[
                {
                  label: "Batches",
                  value: String(data.byItemType.nonPharmBatches),
                },
                {
                  label: "Counted items",
                  value: String(data.byItemType.nonPharmUnits),
                },
                {
                  label: "Est. retail value",
                  value:
                    data.byItemType.nonPharmRetailValue > 0
                      ? formatKes(data.byItemType.nonPharmRetailValue)
                      : "—",
                },
              ]}
            />
          </div>
        </div>
      </ReportSection>

      <ReportSection title="Stock on hand (FEFO order)">
        <ReportTable
          headers={[
            "Type",
            "Item",
            "Batch",
            "Count as",
            "Qty on hand",
            "Expiry",
            "Days",
            "Retail/unit",
            "Value",
            "Notes",
          ]}
          rows={data.rows.map((r) => [
            itemTypeLabel(r.itemType),
            `${r.genericName} — ${r.dosageForm} · ${r.strength}`,
            r.batchNumber ?? "—",
            stockUnitMeta(r.stockUnit).label,
            formatQuantityWithUnit(
              r.quantityOnHand,
              r.stockUnit,
              r.unitsPerPack,
            ),
            r.expiryDate,
            String(r.daysUntilExpiry),
            r.retailSalePrice !== null
              ? formatPricePerUnitShort(r.retailSalePrice, r.stockUnit)
              : "—",
            r.stockValue !== null ? formatKes(r.stockValue) : "—",
            r.flags.length > 0 ? r.flags.join(", ") : "OK",
          ])}
        />
      </ReportSection>
    </ReportPrintLayout>
  );
}
