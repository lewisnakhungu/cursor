import Link from "next/link";
import { AlertTriangle, Package, PackageOpen, Timer } from "lucide-react";
import { getExpiringStock } from "@/lib/actions/inventory";
import { ProcurementDashboardCta } from "@/components/procurement/procurement-dashboard-cta";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getExpiryBadgeVariant,
  getExpiryRisk,
  getExpiryRiskLabel,
} from "@/lib/ui/stock-status";
import {
  formatPricePerUnitShort,
  formatQuantityWithUnit,
  stockUnitMeta,
} from "@/lib/stock-unit";

export async function StockDashboard() {
  const result = await getExpiringStock();

  if (!result.success) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Stock dashboard unavailable</AlertTitle>
        <AlertDescription>{result.error}</AlertDescription>
      </Alert>
    );
  }

  const { hasExpiryWarning, expiringWithin90Days, activeBatches, lowStockCount } =
    result.data;

  const criticalCount = expiringWithin90Days.filter(
    (r) => getExpiryRisk(r.daysUntilExpiry) === "critical",
  ).length;

  return (
    <div className="space-y-6">
      <ProcurementDashboardCta />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active batches"
          value={activeBatches.length}
          hint="In stock, not expired"
          icon={<Package className="size-5" />}
        />
        <StatCard
          label="Expiring ≤90 days"
          value={expiringWithin90Days.length}
          hint="FEFO priority — dispense first"
          tone={hasExpiryWarning ? "warning" : "default"}
          icon={<Timer className="size-5" />}
        />
        <StatCard
          label="Critical (≤30d)"
          value={criticalCount}
          hint="Immediate action"
          tone={criticalCount > 0 ? "critical" : "success"}
          icon={<AlertTriangle className="size-5" />}
        />
        <StatCard
          label="Low stock"
          value={lowStockCount}
          hint="≤10 units per batch"
          tone={lowStockCount > 0 ? "warning" : "default"}
          icon={<PackageOpen className="size-5" />}
        />
      </div>

      {hasExpiryWarning && (
        <Alert variant="warning" className="rounded-xl">
          <AlertTriangle className="size-5" />
          <AlertTitle>Expiry alert — action required</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {expiringWithin90Days.length} batch(es) expire within 90 days.
              Pull nearest expiry first (FEFO) at dispense.
            </span>
            <Link href="/pos">
              <Button size="sm" variant="outline" className="bg-background">
                Open dispense
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {expiringWithin90Days.length > 0 && (
        <section className="pharmacy-panel border-amber-200/80">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="size-5 text-amber-600" />
            Expiry risk queue
          </h2>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>On hand</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringWithin90Days.map((row) => {
                  const risk = getExpiryRisk(row.daysUntilExpiry);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.genericName}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.dosageForm} · {row.strength}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.batchNumber ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {formatQuantityWithUnit(
                          row.quantityOnHand,
                          row.stockUnit,
                          row.unitsPerPack,
                        )}
                      </TableCell>
                      <TableCell>{row.expiryDate}</TableCell>
                      <TableCell className="tabular-nums">
                        {row.daysUntilExpiry}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getExpiryBadgeVariant(risk)}>
                          {getExpiryRiskLabel(risk)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <section className="pharmacy-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Package className="size-5 text-primary" />
            Active stock (FEFO pull order)
          </h2>
          <Link href="/receive">
            <Button variant="outline" size="sm">
              Receive stock
            </Button>
          </Link>
        </div>
        {activeBatches.length === 0 ? (
          <div className="rounded-xl border border-dashed py-12 text-center">
            <p className="font-medium">No inventory on hand</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Receive batches before dispensing at POS.
            </p>
            <Link href="/receive" className="mt-4 inline-block">
              <Button>Receive inventory</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>FEFO</TableHead>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>On hand</TableHead>
                  <TableHead>Unit price</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeBatches.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {index === 0 ? (
                        <Badge variant="fefo">#{index + 1}</Badge>
                      ) : (
                        <span className="text-muted-foreground">#{index + 1}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.genericName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.dosageForm} · {row.strength}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.batchNumber ?? row.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatQuantityWithUnit(
                        row.quantityOnHand,
                        row.stockUnit,
                        row.unitsPerPack,
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {stockUnitMeta(row.stockUnit).label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.retailSalePrice !== null
                        ? formatPricePerUnitShort(
                            row.retailSalePrice,
                            row.stockUnit,
                          )
                        : "—"}
                    </TableCell>
                    <TableCell>{row.expiryDate}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.isExpiringSoon && (
                          <Badge variant="warning">Expiring</Badge>
                        )}
                        {row.isLowStock && (
                          <Badge variant="critical">Low</Badge>
                        )}
                        {!row.isExpiringSoon && !row.isLowStock && (
                          <Badge variant="success">OK</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
