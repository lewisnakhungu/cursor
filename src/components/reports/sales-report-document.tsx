"use client";

import { formatKes } from "@/lib/money";
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
        <ReportKpiGrid
          items={[
            { label: "Transactions", value: String(sales.saleCount) },
            { label: "Units sold", value: String(sales.unitsSold) },
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
            headers={["Date", "Sales", "Units", "Revenue"]}
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
        <ReportSection title="Top selling medicines">
          <ReportTable
            headers={["Medicine", "Formulation", "Units", "Revenue", "Lines"]}
            rows={data.topDrugs.map((d) => [
              d.genericName,
              `${d.dosageForm} · ${d.strength}`,
              String(d.unitsSold),
              formatKes(d.revenue),
              String(d.dispenseCount),
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
                label: "Units received",
                value: String(stocking.unitsReceived),
              },
              {
                label: "Sell-through",
                value: `${stocking.sellThroughPercent}%`,
              },
              {
                label: "Stock cost",
                value:
                  stocking.receiveCostValue > 0
                    ? formatKes(stocking.receiveCostValue)
                    : "—",
              },
            ]}
          />
          <p className="mt-2 text-xs text-neutral-700">
            Units sold from received stock: {stocking.unitsSold} · Revenue from
            those batches: {formatKes(stocking.revenue)}
          </p>
        </ReportSection>
      )}

      {data.weeklyRestockTrend.length > 0 && (
        <ReportSection title="Weekly restock vs sales">
          <ReportTable
            headers={["Week", "Receives", "Units in", "Units sold", "Revenue"]}
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
            headers={["Medicine", "Receives", "Units in", "Units sold"]}
            rows={data.topRestocked.map((r) => [
              r.genericName,
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
