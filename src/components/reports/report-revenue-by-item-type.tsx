"use client";

import { formatKes } from "@/lib/money";
import { itemTypeLabel } from "@/lib/report-item-type";
import type { RevenueByItemType } from "@/lib/types";
import { ReportKpiGrid } from "./report-print-layout";

export function ReportRevenueByItemType({
  byItemType,
  title = "Revenue by item type",
}: {
  byItemType: RevenueByItemType;
  title?: string;
}) {
  const medicineLabel = itemTypeLabel("MEDICINE");
  const nonPharmLabel = itemTypeLabel("NON_PHARM");

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-600">
        {title}
      </p>
      <ReportKpiGrid
        items={[
          {
            label: `${medicineLabel} revenue`,
            value: formatKes(byItemType.medicineRevenue),
          },
          {
            label: `${nonPharmLabel} revenue`,
            value: formatKes(byItemType.nonPharmRevenue),
          },
          {
            label: `${medicineLabel} items`,
            value: String(byItemType.medicineUnitsSold),
          },
          {
            label: `${nonPharmLabel} items`,
            value: String(byItemType.nonPharmUnitsSold),
          },
        ]}
      />
    </div>
  );
}
