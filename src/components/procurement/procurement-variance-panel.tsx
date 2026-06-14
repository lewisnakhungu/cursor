"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { getProcurementVarianceReport } from "@/lib/actions/procurement";
import { stockUnitMeta } from "@/lib/stock-unit";
import type { ProcurementVarianceReport } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ProcurementVariancePanel() {
  const [report, setReport] = useState<ProcurementVarianceReport | null>(null);
  const [loading, startLoad] = useTransition();

  const load = useCallback(() => {
    startLoad(async () => {
      const response = await getProcurementVarianceReport();
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      setReport(response.data);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !report) {
    return (
      <p className="text-sm text-muted-foreground">Loading variance report…</p>
    );
  }

  if (!report || report.rows.length === 0) {
    return (
      <section className="pharmacy-panel">
        <h2 className="pharmacy-panel-title">Order vs received</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Submit procurement orders and receive stock against them to see
          ordered-vs-received variance here.
        </p>
      </section>
    );
  }

  return (
    <section className="pharmacy-panel space-y-4">
      <div>
        <h2 className="pharmacy-panel-title">Order vs received</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare what was ordered with what arrived (last 20 submitted orders).
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Ordered</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Variance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.map((row, i) => (
              <TableRow key={`${row.orderId}-${row.genericName}-${i}`}>
                <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                <TableCell>
                  <div className="font-medium">{row.genericName}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.dosageForm} · {row.strength} ·{" "}
                    {stockUnitMeta(row.stockUnit).label}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">{row.orderedQty}</TableCell>
                <TableCell className="tabular-nums">{row.receivedQty}</TableCell>
                <TableCell
                  className={`tabular-nums ${
                    row.variance < 0
                      ? "text-destructive"
                      : row.variance > 0
                        ? "text-emerald-700"
                        : ""
                  }`}
                >
                  {row.variance > 0 ? `+${row.variance}` : row.variance}
                </TableCell>
                <TableCell className="text-xs">{row.status.replace("_", " ")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
