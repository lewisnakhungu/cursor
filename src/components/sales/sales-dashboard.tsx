"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Pencil,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getSalesDashboard } from "@/lib/actions/sales";
import { correctSaleLine } from "@/lib/actions/dispense";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatKes } from "@/lib/money";
import {
  formatPricePerUnitShort,
  formatQuantityWithUnit,
  stockUnitMeta,
} from "@/lib/stock-unit";
import type { SalesDashboardData, SaleLineView } from "@/lib/types";

export function SalesDashboardClient() {
  const [data, setData] = useState<SalesDashboardData | null>(null);
  const [loading, startLoad] = useTransition();
  const [correctingLine, setCorrectingLine] = useState<SaleLineView | null>(
    null,
  );
  const [newQty, setNewQty] = useState("");
  const [reason, setReason] = useState("");
  const [isCorrecting, startCorrect] = useTransition();

  const load = useCallback(() => {
    startLoad(async () => {
      const response = await getSalesDashboard();
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      setData(response.data);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCorrection = (line: SaleLineView) => {
    setCorrectingLine(line);
    setNewQty(String(line.quantity));
    setReason("");
  };

  const submitCorrection = () => {
    if (!correctingLine) return;
    const qty = Number.parseInt(newQty, 10);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("Enter a valid quantity (0 to void line)");
      return;
    }

    startCorrect(async () => {
      const response = await correctSaleLine({
        saleLineId: correctingLine.id,
        newQuantity: qty,
        reason,
      });
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success("Sale line corrected — stock adjusted");
      setCorrectingLine(null);
      load();
    });
  };

  if (!data && loading) {
    return (
      <AppShell title="Sales" subtitle="Loading today's metrics…">
        <p className="text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell title="Sales" subtitle="Unable to load">
        <Button onClick={load}>Retry</Button>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Sales & audit"
      subtitle="Today's revenue, top movers, and dispense corrections"
      actions={
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's sales"
          value={data.today.saleCount}
          hint="Completed dispense transactions"
          icon={<Receipt className="size-5" />}
        />
        <StatCard
          label="Today's revenue"
          value={formatKes(data.today.grossRevenue)}
          hint="Active line totals only"
          tone="success"
          icon={<TrendingUp className="size-5" />}
        />
        <StatCard
          label="Items dispensed today"
          value={data.today.unitsSold}
          hint={`${data.today.lineCount} line(s) — mixed units; see detail below`}
          icon={<BarChart3 className="size-5" />}
        />
        <StatCard
          label="Voided / corrected"
          value={data.today.voidedLines}
          hint="Audit adjustments today"
          tone={data.today.voidedLines > 0 ? "warning" : "default"}
          icon={<Pencil className="size-5" />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="pharmacy-panel">
          <h2 className="mb-4 text-base font-semibold">
            Top drugs today (by qty, per counting unit)
          </h2>
          {data.topDrugsToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales yet today.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Count as</TableHead>
                  <TableHead>Qty sold</TableHead>
                  <TableHead>Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topDrugsToday.map((drug, i) => (
                  <TableRow key={`${drug.medicineId}-${drug.stockUnit}-${i}`}>
                    <TableCell>
                      <div className="font-medium">{drug.genericName}</div>
                      <div className="text-xs text-muted-foreground">
                        {drug.dosageForm} · {drug.strength}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {stockUnitMeta(drug.stockUnit).label}
                      {drug.unitsPerPack
                        ? ` (${drug.unitsPerPack}/pack)`
                        : ""}
                    </TableCell>
                    <TableCell>{drug.unitsSold}</TableCell>
                    <TableCell>{formatKes(drug.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section className="pharmacy-panel">
          <h2 className="mb-4 text-base font-semibold">
            Top drugs — last 7 days
          </h2>
          {data.topDrugs7Days.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales in period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Count as</TableHead>
                  <TableHead>Qty sold</TableHead>
                  <TableHead>Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topDrugs7Days.map((drug, i) => (
                  <TableRow key={`${drug.medicineId}-7d-${drug.stockUnit}-${i}`}>
                    <TableCell>
                      <div className="font-medium">{drug.genericName}</div>
                      <div className="text-xs text-muted-foreground">
                        {drug.dosageForm} · {drug.strength}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {stockUnitMeta(drug.stockUnit).label}
                    </TableCell>
                    <TableCell>{drug.unitsSold}</TableCell>
                    <TableCell>{formatKes(drug.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>

      <section className="pharmacy-panel mt-6">
        <h2 className="mb-4 text-base font-semibold">Today&apos;s sales (audit)</h2>
        {data.todaySales.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No dispenses recorded today. Use POS to create sales.
          </p>
        ) : (
          <div className="space-y-4">
            {data.todaySales.map((sale) => (
              <div
                key={sale.id}
                className="rounded-xl border bg-background p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm">
                      {sale.id.slice(0, 12)}…
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("en-KE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(sale.createdAt))}
                    </p>
                  </div>
                  <p className="text-lg font-semibold">
                    {formatKes(sale.totalAmount)}
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Drug</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Price / unit</TableHead>
                      <TableHead>Line total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sale.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <div className="font-medium">{line.genericName}</div>
                          <div className="text-xs text-muted-foreground">
                            {line.dosageForm} · {line.strength}
                          </div>
                          {line.correctionNote && (
                            <p className="mt-1 text-xs text-amber-700">
                              Note: {line.correctionNote}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {formatQuantityWithUnit(
                            line.quantity,
                            line.stockUnit,
                            line.unitsPerPack,
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {formatKes(line.unitPrice)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatPricePerUnitShort(
                              line.unitPrice,
                              line.stockUnit,
                            )}
                          </span>
                        </TableCell>
                        <TableCell>{formatKes(line.lineTotal)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              line.status === "VOIDED" ? "critical" : "success"
                            }
                          >
                            {line.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {line.status === "ACTIVE" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openCorrection(line)}
                            >
                              Correct
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(correctingLine)}
        onOpenChange={(open) => !open && setCorrectingLine(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct dispense line</DialogTitle>
            <DialogDescription>
              Adjust quantity for audit mistakes. Stock is restored or deducted
              automatically. Set quantity to 0 to void the line.
            </DialogDescription>
          </DialogHeader>
          {correctingLine && (
            <div className="space-y-4">
              <p className="font-medium">{correctingLine.genericName}</p>
              <p className="text-sm text-muted-foreground">
                Current:{" "}
                {formatQuantityWithUnit(
                  correctingLine.quantity,
                  correctingLine.stockUnit,
                  correctingLine.unitsPerPack,
                )}{" "}
                · Was {formatKes(correctingLine.lineTotal)} (
                {formatPricePerUnitShort(
                  correctingLine.unitPrice,
                  correctingLine.stockUnit,
                )}
                )
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="new-qty">
                  New quantity ({stockUnitMeta(correctingLine.stockUnit).label}
                  s)
                </label>
                <Input
                  id="new-qty"
                  type="number"
                  min={0}
                  className="h-11"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="reason">
                  Audit reason (required)
                </label>
                <Input
                  id="reason"
                  placeholder="e.g. Wrong batch picked, patient cancelled"
                  className="h-11"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectingLine(null)}>
              Cancel
            </Button>
            <Button onClick={submitCorrection} disabled={isCorrecting}>
              {isCorrecting ? "Saving…" : "Save correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
