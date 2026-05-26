"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, Package, Printer } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getSalesReport, getStockReport } from "@/lib/actions/reports";
import { SalesReportDocument } from "@/components/reports/sales-report-document";
import { StockReportDocument } from "@/components/reports/stock-report-document";
import { Button } from "@/components/ui/button";
import type { ReportPeriodDays, SalesReportData, StockReportData } from "@/lib/types";

type ActiveReport =
  | { type: "sales"; data: SalesReportData }
  | { type: "stock"; data: StockReportData };

export function ReportsHub() {
  const printRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<ActiveReport | null>(null);
  const [loading, startLoad] = useTransition();

  const loadSales = (period: ReportPeriodDays) => {
    startLoad(async () => {
      const response = await getSalesReport(period);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      setActive({ type: "sales", data: response.data });
      toast.success("Report ready — use Print or browser print (Ctrl+P)");
    });
  };

  const loadStock = () => {
    startLoad(async () => {
      const response = await getStockReport();
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      setActive({ type: "stock", data: response.data });
      toast.success("Stock report ready");
    });
  };

  const handlePrint = useCallback(() => {
    if (!active) {
      toast.error("Generate a report first");
      return;
    }
    window.print();
  }, [active]);

  const clearReport = () => setActive(null);

  return (
    <>
      <div className="print:hidden">
        <AppShell
          title="Reports"
          subtitle="Printable weekly, monthly, and stock reports for your records"
          actions={
            active ? (
              <>
                <Button variant="outline" onClick={clearReport} disabled={loading}>
                  Clear
                </Button>
                <Button onClick={handlePrint} disabled={loading} className="min-h-11">
                  <Printer className="mr-2 size-4" />
                  Print
                </Button>
              </>
            ) : null
          }
        >
          <div className="grid gap-6 md:grid-cols-2">
            <section className="pharmacy-panel">
              <h2 className="pharmacy-panel-title mb-2 flex items-center gap-2">
                <FileText className="size-4" />
                Sales & stocking reports
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Revenue, daily sales, top medicines, restock activity, and
                sell-through for the selected period. Suitable for weekly or
                monthly review.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="min-h-11 flex-1"
                  disabled={loading}
                  onClick={() => loadSales(7)}
                >
                  Weekly (7 days)
                </Button>
                <Button
                  className="min-h-11 flex-1"
                  variant="secondary"
                  disabled={loading}
                  onClick={() => loadSales(30)}
                >
                  Monthly (30 days)
                </Button>
              </div>
            </section>

            <section className="pharmacy-panel">
              <h2 className="pharmacy-panel-title mb-2 flex items-center gap-2">
                <Package className="size-4" />
                Available stock report
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Full list of current inventory: batch, quantity, expiry, retail
                value, and expiry/low-stock flags. Print for shelf checks or
                audits.
              </p>
              <Button
                className="min-h-11 w-full sm:w-auto"
                variant="outline"
                disabled={loading}
                onClick={loadStock}
              >
                Generate stock report
              </Button>
            </section>
          </div>

          {active && (
            <section className="pharmacy-panel mt-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Preview</h2>
                <Button onClick={handlePrint} className="min-h-11">
                  <Printer className="mr-2 size-4" />
                  Print this report
                </Button>
              </div>
              <div className="max-h-[70vh] overflow-auto rounded-lg border bg-white shadow-inner">
                <div ref={printRef}>
                  {active.type === "sales" ? (
                    <SalesReportDocument data={active.data} />
                  ) : (
                    <StockReportDocument data={active.data} />
                  )}
                </div>
              </div>
            </section>
          )}

          {!active && !loading && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Choose a report type above. Use your browser print dialog and select
              A4 portrait for best results.
            </p>
          )}
          {loading && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Building report…
            </p>
          )}
        </AppShell>
      </div>

      {/* Print-only duplicate — visible only when printing */}
      {active && (
        <div className="facility-report-print-root hidden print:block">
          {active.type === "sales" ? (
            <SalesReportDocument data={active.data} />
          ) : (
            <StockReportDocument data={active.data} />
          )}
        </div>
      )}
    </>
  );
}
