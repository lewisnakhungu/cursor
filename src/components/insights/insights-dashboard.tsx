"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  LineChart,
  PackagePlus,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { getStockingInsights } from "@/lib/actions/insights";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatKes } from "@/lib/money";
import {
  formatPricePerUnitShort,
  formatQuantityWithUnit,
  stockUnitMeta,
} from "@/lib/stock-unit";
import type { InsightsPeriodDays, StockingInsightsData } from "@/lib/types";
import { cn } from "@/lib/utils";

const PERIODS: { days: InsightsPeriodDays; label: string }[] = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SellThroughBadge({ percent }: { percent: number }) {
  const variant =
    percent >= 75 ? "success" : percent >= 40 ? "warning" : "critical";
  return <Badge variant={variant}>{percent}% sold</Badge>;
}

export function InsightsDashboardClient() {
  const [period, setPeriod] = useState<InsightsPeriodDays>(30);
  const [data, setData] = useState<StockingInsightsData | null>(null);
  const [loading, startLoad] = useTransition();

  const load = useCallback((days: InsightsPeriodDays) => {
    startLoad(async () => {
      const response = await getStockingInsights(days);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      setData(response.data);
    });
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  if (!data && loading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  if (!data) {
    return <Button onClick={() => load(period)}>Retry</Button>;
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" onClick={() => load(period)} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.days}
            type="button"
            size="sm"
            variant={period === p.days ? "default" : "outline"}
            className="min-h-10"
            onClick={() => setPeriod(p.days)}
            disabled={loading}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <p className="mb-6 text-sm text-muted-foreground">
        Showing <strong>{data.periodLabel}</strong> — each row is one receive
        (restock). Quantities use the <strong>counting unit</strong> chosen at
        receive (tablets, boxes, etc.); prices are per that same unit.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Restock events"
          value={data.summary.receiveEvents}
          hint={`${data.summary.distinctMedicines} different medicines`}
          icon={<PackagePlus className="size-5" />}
        />
        <StatCard
          label="Items received"
          value={data.summary.unitsReceived}
          hint={
            data.summary.receiveCostValue > 0
              ? `Stock-in cost ${formatKes(data.summary.receiveCostValue)}`
              : "Add supplier cost per unit on receive for margin"
          }
          icon={<TrendingUp className="size-5" />}
        />
        <StatCard
          label="Sell-through"
          value={`${data.summary.sellThroughPercent}%`}
          hint={`${data.summary.unitsSold} dispensed · ${formatKes(data.summary.revenue)} revenue${
            data.summary.grossMargin !== null
              ? ` · Margin ${formatKes(data.summary.grossMargin)}`
              : ""
          }`}
          tone={
            data.summary.sellThroughPercent < 40
              ? "warning"
              : data.summary.sellThroughPercent >= 70
                ? "default"
                : "warning"
          }
          icon={<LineChart className="size-5" />}
        />
      </div>

      {data.weeklyTrend.length > 0 && (
        <section className="pharmacy-panel mt-6">
          <h2 className="mb-4 text-base font-semibold">Weekly restock vs sales</h2>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead className="text-right">Receives</TableHead>
                  <TableHead className="text-right">Qty in</TableHead>
                  <TableHead className="text-right">Qty sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.weeklyTrend.map((week) => (
                  <TableRow key={week.weekStart}>
                    <TableCell className="font-medium">{week.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {week.receiveCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {week.unitsReceived}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {week.unitsSold}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatKes(week.revenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {data.topRestocked.length > 0 && (
        <section className="pharmacy-panel mt-6">
          <h2 className="mb-4 text-base font-semibold">Most restocked medicines</h2>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Receives</TableHead>
                  <TableHead className="text-right">Qty in</TableHead>
                  <TableHead className="text-right">Qty sold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topRestocked.map((row) => (
                  <TableRow key={`${row.genericName}-${row.stockUnit}`}>
                    <TableCell className="font-medium">{row.genericName}</TableCell>
                    <TableCell className="text-sm">
                      {stockUnitMeta(row.stockUnit).label}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.receiveCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.unitsReceived}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.unitsSold}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {data.slowMovers.length > 0 && (
        <section className="pharmacy-panel mt-6 border-amber-200/80 bg-amber-50/40">
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="size-5 text-amber-700" />
            Slow movers (low sell-through)
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Received over 14 days ago with less than 25% sold — review ordering or
            promote at POS.
          </p>
          <div className="overflow-x-auto rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead className="text-right">Left</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead>Sell-through</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slowMovers.map((row) => (
                  <TableRow key={row.batchId}>
                    <TableCell>
                      <div className="font-medium">{row.genericName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.dosageForm} · {row.strength}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantityOnHand}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatQuantityWithUnit(
                        row.quantitySold,
                        row.stockUnit,
                        row.unitsPerPack,
                      )}{" "}
                      /{" "}
                      {formatQuantityWithUnit(
                        row.quantityReceived,
                        row.stockUnit,
                        row.unitsPerPack,
                      )}
                    </TableCell>
                    <TableCell>
                      <SellThroughBadge percent={row.sellThroughPercent} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <section className="pharmacy-panel mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Receive history (detail)</h2>
          <Link href="/receive">
            <Button size="sm" variant="outline">
              <PackagePlus className="mr-1 size-4" />
              New receive
            </Button>
          </Link>
        </div>

        {data.receiveHistory.length === 0 ? (
          <div className="rounded-xl border border-dashed py-12 text-center">
            <p className="font-medium">No restocks in this period</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Record inventory at Receive — history appears here with linked sales.
            </p>
            <Link href="/receive" className="mt-4 inline-block">
              <Button>Receive stock</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Count as</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">In</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Left</TableHead>
                  <TableHead className="text-right">Cost/unit</TableHead>
                  <TableHead className="text-right">Retail/unit</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead>Sell-through</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.receiveHistory.map((row) => (
                  <TableRow key={row.batchId}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(row.receivedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[8rem] font-medium">
                        {row.genericName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.dosageForm} · {row.strength}
                      </div>
                      {row.batchNumber && (
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {row.batchNumber}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {stockUnitMeta(row.stockUnit).label}
                      {row.unitsPerPack ? (
                        <span className="block text-xs text-muted-foreground">
                          {row.unitsPerPack} per pack
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.supplierName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantityReceived}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantitySold}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        row.quantityOnHand <= 10 && "font-medium text-amber-700",
                      )}
                    >
                      {row.quantityOnHand}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.supplierCost !== null
                        ? formatPricePerUnitShort(row.supplierCost, row.stockUnit)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.retailSalePrice !== null
                        ? formatPricePerUnitShort(
                            row.retailSalePrice,
                            row.stockUnit,
                          )
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatKes(row.revenueFromBatch)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.grossMargin !== null
                        ? formatKes(row.grossMargin)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <SellThroughBadge percent={row.sellThroughPercent} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}
