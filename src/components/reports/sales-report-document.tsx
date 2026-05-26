"use client";

import { formatKes } from "@/lib/money";
import {
  formatPricePerUnitShort,
  formatQuantityWithUnit,
  stockUnitMeta,
} from "@/lib/stock-unit";
import type { SalesReportData } from "@/lib/types";
import {
  ReportKpiGrid,
  ReportPrintLayout,
  ReportSection,
  ReportTable,
} from "./report-print-layout";

function formatPeriodRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-KE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(start)} — ${fmt(end)}`;
}

function formatSaleAt(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function SalesReportDocument({ data }: { data: SalesReportData }) {
  const { sales, stocking } = data;

  return (
    <ReportPrintLayout
      title={data.reportTitle}
      subtitle={data.periodLabel}
      facilityName={data.facilityName}
      generatedAt={data.generatedAt}
      periodRange={formatPeriodRange(data.periodStart, data.periodEnd)}
    >
      <ReportSection title="Sales summary">
        <p className="mb-3 text-xs text-neutral-700">
          Quantities are counted in the unit defined at receive (tablet, box,
          bottle, etc.). Totals mix different units — use line detail for audit.
        </p>
        <ReportKpiGrid
          items={[
            { label: "Transactions", value: String(sales.saleCount) },
            { label: "Items dispensed", value: String(sales.unitsSold) },
            { label: "Gross revenue", value: formatKes(sales.grossRevenue) },
            {
              label: "Avg per sale",
              value: formatKes(sales.averageSaleValue),
            },
          ]}
        />
        {sales.voidedLines > 0 ? (
          <p className="mt-2 text-xs text-neutral-700">
            Voided / corrected lines in period: {sales.voidedLines}
          </p>
        ) : null}
      </ReportSection>

      {data.salesByDay.length > 0 && (
        <ReportSection title="Sales by day">
          <ReportTable
            headers={["Date", "Sales", "Items", "Revenue"]}
            rows={data.salesByDay.map((d) => [
              d.label,
              String(d.saleCount),
              String(d.unitsSold),
              formatKes(d.revenue),
            ])}
          />
        </ReportSection>
      )}

      {data.topDrugs.length > 0 && (
        <ReportSection title="Top selling medicines (by counting unit)">
          <ReportTable
            headers={[
              "Medicine",
              "Formulation",
              "Count as",
              "Qty sold",
              "Revenue",
              "Lines",
            ]}
            rows={data.topDrugs.map((d) => [
              d.genericName,
              `${d.dosageForm} · ${d.strength}`,
              stockUnitMeta(d.stockUnit).label,
              String(d.unitsSold),
              formatKes(d.revenue),
              String(d.dispenseCount),
            ])}
          />
        </ReportSection>
      )}

      {data.lineDetails.length > 0 && (
        <ReportSection title="Dispense line detail (audit)">
          <ReportTable
            headers={[
              "Date/time",
              "Medicine",
              "Batch",
              "Quantity",
              "Price/unit",
              "Line total",
              "Status",
            ]}
            rows={data.lineDetails.map((line) => [
              formatSaleAt(line.saleAt),
              `${line.genericName} (${line.dosageForm})`,
              line.batchNumber ?? "—",
              formatQuantityWithUnit(
                line.quantity,
                line.stockUnit,
                line.unitsPerPack,
              ),
              formatPricePerUnitShort(line.unitPrice, line.stockUnit),
              formatKes(line.lineTotal),
              line.status,
            ])}
          />
        </ReportSection>
      )}

      {stocking && (
        <ReportSection title="Stocking & sell-through (same period)">
          <ReportKpiGrid
            items={[
              {
                label: "Restock events",
                value: String(stocking.receiveEvents),
              },
              {
                label: "Items received",
                value: String(stocking.unitsReceived),
              },
              {
                label: "Sell-through",
                value: `${stocking.sellThroughPercent}%`,
              },
              {
                label: "Stock-in cost",
                value:
                  stocking.receiveCostValue > 0
                    ? formatKes(stocking.receiveCostValue)
                    : "—",
              },
            ]}
          />
          <p className="mt-2 text-xs text-neutral-700">
            Dispensed from received batches: {stocking.unitsSold} items ·
            Revenue {formatKes(stocking.revenue)}
            {stocking.grossMargin !== null
              ? ` · Gross margin ${formatKes(stocking.grossMargin)}`
              : ""}
          </p>
        </ReportSection>
      )}

      {data.weeklyRestockTrend.length > 0 && (
        <ReportSection title="Weekly restock vs sales">
          <ReportTable
            headers={["Week", "Receives", "Qty in", "Qty sold", "Revenue"]}
            rows={data.weeklyRestockTrend.map((w) => [
              w.label,
              String(w.receiveCount),
              String(w.unitsReceived),
              String(w.unitsSold),
              formatKes(w.revenue),
            ])}
          />
        </ReportSection>
      )}

      {data.topRestocked.length > 0 && (
        <ReportSection title="Most restocked medicines">
          <ReportTable
            headers={["Medicine", "Unit", "Receives", "Qty in", "Qty sold"]}
            rows={data.topRestocked.map((r) => [
              r.genericName,
              stockUnitMeta(r.stockUnit).label,
              String(r.receiveCount),
              String(r.unitsReceived),
              String(r.unitsSold),
            ])}
          />
        </ReportSection>
      )}
    </ReportPrintLayout>
  );
}
