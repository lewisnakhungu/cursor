import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Clock,
  FileText,
  Package,
  PackagePlus,
  PackageSearch,
  ShoppingCart,
  Timer,
} from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveFacilityName } from "@/lib/auth/session-types";
import { getExpiringStock } from "@/lib/actions/inventory";
import { getSalesDashboard } from "@/lib/actions/sales";
import { listProcurementOrders } from "@/lib/actions/procurement";
import { formatKes } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HeroTelemetryCard } from "@/components/dashboard/hero-telemetry-card";
import { cn } from "@/lib/utils";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDateHeader(): string {
  return new Intl.DateTimeFormat("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());
}

export async function DashboardHome() {
  const session = await getSession();
  const canViewSales = session ? hasPermission(session, "sales.view") : false;
  const canProcure = session ? hasPermission(session, "procurement.manage") : false;

  // Parallel fetch for speed
  const [stockRes, salesRes, procurementRes] = await Promise.all([
    getExpiringStock(),
    canViewSales ? getSalesDashboard() : Promise.resolve(null),
    canProcure ? listProcurementOrders() : Promise.resolve(null),
  ]);

  const stockData = stockRes.success ? stockRes.data : null;
  const salesData = salesRes?.success ? salesRes.data : null;
  const procurementOrders = procurementRes?.success ? procurementRes.data : [];

  const facilityName = session
    ? getActiveFacilityName(session) ?? "My Pharmacy"
    : "My Pharmacy";
  const userName = session?.name || session?.email?.split("@")[0] || "Staff";
  const userRole = session?.activeRole ?? "STAFF";

  const todayRevenue = salesData?.today.grossRevenue ?? 0;
  const todaySalesCount = salesData?.today.saleCount ?? 0;
  const activeBatches = stockData?.activeBatches ?? [];
  const activeBatchesCount = activeBatches.length;
  const expiringWithin90Days = stockData?.expiringWithin90Days ?? [];
  const expiringCount = expiringWithin90Days.length;
  const lowStockCount = stockData?.lowStockCount ?? 0;

  // Critical expiries ≤ 30 days
  const criticalExpiries = expiringWithin90Days.filter(
    (b) => b.daysUntilExpiry <= 30,
  );
  const criticalValue = criticalExpiries.reduce(
    (sum, b) => sum + (b.retailSalePrice ?? 0) * b.quantityOnHand,
    0,
  );

  // Low stock batches
  const lowStockItems = activeBatches.filter((b) => b.isLowStock);
  const topLowStock = lowStockItems[0] ?? null;

  // Draft procurement orders
  const draftOrders = procurementOrders.filter((o) => o.status === "DRAFT");

  const totalNeedsAttention =
    (lowStockCount > 0 ? 1 : 0) +
    (criticalExpiries.length > 0 ? 1 : 0) +
    (draftOrders.length > 0 ? 1 : 0);

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-16 pt-1 sm:pt-2">
      {/* ========================================================================= */}
      {/* 1. HERO ACCOUNT CARD (Context, Today's Sales, Balance Privacy Toggle)     */}
      {/* ========================================================================= */}
      <HeroTelemetryCard
        facilityName={facilityName}
        userName={userName}
        userRole={userRole}
        todayRevenue={todayRevenue}
        todaySalesCount={todaySalesCount}
        activeBatchesCount={activeBatchesCount}
        expiringCount={expiringCount}
        lowStockCount={lowStockCount}
        canViewSales={canViewSales}
        dateHeader={formatDateHeader()}
        greeting={getGreeting()}
      />

      {/* ========================================================================= */}
      {/* 2. THE "NEEDS ATTENTION" TRIAGE QUEUE (Action-Oriented Clinical Work)      */}
      {/* ========================================================================= */}
      <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3 border-b pb-2.5">
          <div className="flex items-center gap-2">
            <div className={cn(
              "size-2 rounded-full",
              totalNeedsAttention > 0 ? "bg-rose-500 animate-pulse" : "bg-emerald-500",
            )} />
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-foreground">
              Needs Attention
            </h2>
          </div>
          {totalNeedsAttention > 0 ? (
            <Badge variant="critical" className="text-[10px] font-bold px-2 py-0.5">
              {totalNeedsAttention} action{totalNeedsAttention === 1 ? "" : "s"} required
            </Badge>
          ) : (
            <Badge variant="success" className="text-[10px] font-medium px-2 py-0.5">
              All clear
            </Badge>
          )}
        </div>

        <div className="space-y-2.5">
          {/* A. Low Stock Alert */}
          {lowStockCount > 0 ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/30">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-rose-950 dark:text-rose-200 truncate">
                    {lowStockCount} medicine{lowStockCount === 1 ? "" : "s"} need reordering
                  </p>
                  {topLowStock && (
                    <p className="text-[11px] text-rose-800/80 dark:text-rose-300/80 truncate">
                      {topLowStock.genericName} &middot; {topLowStock.quantityOnHand} {topLowStock.stockUnit.toLowerCase()} remaining
                    </p>
                  )}
                </div>
              </div>
              <Link href="/procurement" className="shrink-0">
                <Button size="sm" variant="destructive" className="h-8 px-3 text-xs font-semibold shadow-xs">
                  Reorder
                </Button>
              </Link>
            </div>
          ) : null}

          {/* B. Critical Expiry Alert (≤30 Days) */}
          {criticalExpiries.length > 0 ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Timer className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-amber-950 dark:text-amber-200 truncate">
                    {criticalExpiries.length} batch(es) expire within 30 days
                  </p>
                  <p className="text-[11px] text-amber-900/80 dark:text-amber-300/80 truncate">
                    Est. value: {formatKes(criticalValue)} &middot; Prioritize FEFO
                  </p>
                </div>
              </div>
              <Link href="/pos" className="shrink-0">
                <Button size="sm" className="h-8 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs">
                  Open POS
                </Button>
              </Link>
            </div>
          ) : null}

          {/* C. Draft Purchase Orders */}
          {draftOrders.length > 0 ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-blue-200 bg-blue-50/70 dark:border-blue-900/60 dark:bg-blue-950/30">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-blue-950 dark:text-blue-200 truncate">
                    {draftOrders.length} purchase order draft{draftOrders.length === 1 ? "" : "s"} waiting
                  </p>
                  <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80 truncate">
                    Review and submit to supplier
                  </p>
                </div>
              </div>
              <Link href="/procurement" className="shrink-0">
                <Button size="sm" variant="outline" className="h-8 px-3 text-xs font-semibold bg-background">
                  View drafts
                </Button>
              </Link>
            </div>
          ) : null}

          {/* D. Calm state when all is healthy */}
          {totalNeedsAttention === 0 && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-xs">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span>No immediate stock risks or expiring batches. Counter is operating normally.</span>
            </div>
          )}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. PRIMARY QUICK ACTIONS (Clean Symmetrical 4-Column Bar)                  */}
      {/* ========================================================================= */}
      <section>
        <div className="flex items-center justify-between mb-2.5 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Quick Actions
          </h2>
          <span className="text-[11px] text-muted-foreground">Tap to open</span>
        </div>

        <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
          {/* Action 1: Dispense */}
          <Link
            href="/pos"
            className="group flex flex-col items-center justify-center p-3 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-primary hover:shadow-sm active:scale-95 transition-all text-center"
          >
            <div className="size-11 sm:size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <ShoppingCart className="size-5 sm:size-6" />
            </div>
            <span className="mt-2 text-xs font-bold text-foreground group-hover:text-primary transition-colors">
              Dispense
            </span>
            <span className="text-[10px] text-muted-foreground">POS</span>
          </Link>

          {/* Action 2: Receive */}
          <Link
            href="/receive"
            className="group flex flex-col items-center justify-center p-3 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-blue-500/50 hover:shadow-sm active:scale-95 transition-all text-center"
          >
            <div className="size-11 sm:size-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <PackagePlus className="size-5 sm:size-6" />
            </div>
            <span className="mt-2 text-xs font-bold text-foreground">
              Receive
            </span>
            <span className="text-[10px] text-muted-foreground">Stock In</span>
          </Link>

          {/* Action 3: Inventory */}
          <Link
            href="/inventory"
            className="group flex flex-col items-center justify-center p-3 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-emerald-500/50 hover:shadow-sm active:scale-95 transition-all text-center"
          >
            <div className="size-11 sm:size-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Package className="size-5 sm:size-6" />
            </div>
            <span className="mt-2 text-xs font-bold text-foreground">
              Inventory
            </span>
            <span className="text-[10px] text-muted-foreground">Batches</span>
          </Link>

          {/* Action 4: Procurement */}
          <Link
            href="/procurement"
            className="group flex flex-col items-center justify-center p-3 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-amber-500/50 hover:shadow-sm active:scale-95 transition-all text-center"
          >
            <div className="size-11 sm:size-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <PackageSearch className="size-5 sm:size-6" />
            </div>
            <span className="mt-2 text-xs font-bold text-foreground">
              Procurement
            </span>
            <span className="text-[10px] text-muted-foreground">Orders</span>
          </Link>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. RECENT ACTIVITY (Today's Sales Statement Ticker)                       */}
      {/* ========================================================================= */}
      {canViewSales && salesData?.todaySales && salesData.todaySales.length > 0 && (
        <section className="rounded-2xl border bg-card p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2.5 border-b pb-2.5">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <h3 className="text-xs sm:text-sm font-semibold text-foreground">
                Today&apos;s Recent Sales
              </h3>
            </div>
            <Link
              href="/sales"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              <span>See all {salesData.todaySales.length}</span>
              <ChevronRight className="size-3" />
            </Link>
          </div>

          <div className="divide-y">
            {salesData.todaySales.slice(0, 3).map((sale) => {
              const time = new Date(sale.createdAt).toLocaleTimeString("en-KE", {
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <div
                  key={sale.id}
                  className="flex items-center justify-between py-2 hover:bg-muted/40 px-1.5 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="size-7 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                      ✓
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">
                        Sale #{sale.id.slice(-6).toUpperCase()}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {time} &middot; {sale.activeLineCount} item{sale.activeLineCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-foreground font-mono">
                    {formatKes(sale.totalAmount)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 5. INVENTORY SNAPSHOT (Clean Summary Box Linking to Full /inventory)      */}
      {/* ========================================================================= */}
      <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3 border-b pb-2.5">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-foreground">
              Inventory Snapshot
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Active stock batches and replenishment tracking
            </p>
          </div>
          <Link href="/inventory">
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs font-medium">
              <span>View inventory</span>
              <ArrowRight className="size-3" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center sm:text-left">
          <div className="rounded-xl bg-muted/40 p-2.5 border">
            <p className="text-[10px] text-muted-foreground uppercase font-medium">Active Batches</p>
            <p className="text-lg font-bold text-foreground mt-0.5">{activeBatchesCount}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-2.5 border">
            <p className="text-[10px] text-muted-foreground uppercase font-medium">Expiring Soon</p>
            <p className={cn("text-lg font-bold mt-0.5", expiringCount > 0 ? "text-amber-600" : "text-foreground")}>
              {expiringCount}
            </p>
          </div>
          <div className="rounded-xl bg-muted/40 p-2.5 border">
            <p className="text-[10px] text-muted-foreground uppercase font-medium">Low Stock</p>
            <p className={cn("text-lg font-bold mt-0.5", lowStockCount > 0 ? "text-rose-600" : "text-foreground")}>
              {lowStockCount}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
