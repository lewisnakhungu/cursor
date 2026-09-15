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
  TrendingUp,
  Users,
} from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveFacilityName } from "@/lib/auth/session-types";
import { getExpiringStock } from "@/lib/actions/inventory";
import { getSalesDashboard } from "@/lib/actions/sales";
import { formatKes } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StockDashboard } from "@/components/dashboard/stock-dashboard";
import { cn } from "@/lib/utils";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDateHeader(): string {
  return new Intl.DateTimeFormat("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

export async function BankingHub() {
  const session = await getSession();
  const canViewSales = session ? hasPermission(session, "sales.view") : false;
  const canReceive = session ? hasPermission(session, "receive.stock") : false;
  const canProcure = session ? hasPermission(session, "procurement.manage") : false;
  const canViewReports = session ? hasPermission(session, "reports.view") : false;
  const canManageTeam = session ? hasPermission(session, "facility.manage_team") : false;

  // Parallel data fetching for instant response
  const [stockRes, salesRes] = await Promise.all([
    getExpiringStock(),
    canViewSales ? getSalesDashboard() : Promise.resolve(null),
  ]);

  const stockData = stockRes.success ? stockRes.data : null;
  const salesData = salesRes?.success ? salesRes.data : null;

  const facilityName = session
    ? getActiveFacilityName(session) ?? "My Pharmacy"
    : "My Pharmacy";
  const userName = session?.name || session?.email?.split("@")[0] || "Staff";
  const userRole = session?.activeRole ?? "STAFF";

  const todayRevenue = salesData?.today.grossRevenue ?? 0;
  const todaySalesCount = salesData?.today.saleCount ?? 0;
  const activeBatchesCount = stockData?.activeBatches.length ?? 0;
  const expiringCount = stockData?.expiringWithin90Days.length ?? 0;
  const lowStockCount = stockData?.lowStockCount ?? 0;

  // Critical expiries within 30 days
  const criticalExpiries = stockData?.expiringWithin90Days.filter(
    (b) => b.daysUntilExpiry <= 30,
  ) ?? [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* ========================================================================= */}
      {/* 1. HERO ACCOUNT / TELEMETRY CARD (Banking Style "Account Balance" Banner) */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-950 p-5 sm:p-7 text-white shadow-xl border border-emerald-500/20">
        {/* Subtle decorative glow */}
        <div className="absolute -top-16 -right-16 size-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 size-48 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />

        {/* Top bar inside hero */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium tracking-wide uppercase text-emerald-300">
              {facilityName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300 font-medium">
              {formatDateHeader()}
            </span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 uppercase tracking-wider">
              {userRole}
            </span>
          </div>
        </div>

        {/* Main greeting & balance section */}
        <div className="pt-5 pb-3">
          <p className="text-sm font-medium text-emerald-200/90">
            {getGreeting()}, <span className="text-white font-semibold">{userName}</span>
          </p>

          {canViewSales ? (
            <div className="mt-2 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Today&apos;s Dispensed Revenue
                </p>
                <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mt-1">
                  {formatKes(todayRevenue)}
                </p>
              </div>
              <p className="text-xs text-emerald-300 font-medium sm:text-right">
                {todaySalesCount} sale{todaySalesCount === 1 ? "" : "s"} completed today
              </p>
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Point of Sale Terminal
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-white mt-1">
                Dispense Station Ready
              </p>
            </div>
          )}
        </div>

        {/* Live status chips (Account telemetry) */}
        <div className="mt-3 grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-center sm:text-left">
          {/* Batches in stock */}
          <div className="rounded-xl bg-white/5 p-2.5 backdrop-blur-sm border border-white/5">
            <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">
              In Stock
            </p>
            <p className="text-base sm:text-lg font-bold text-white mt-0.5">
              {activeBatchesCount}{" "}
              <span className="text-[10px] font-normal text-slate-400 hidden sm:inline">
                batches
              </span>
            </p>
          </div>

          {/* Expiring ≤ 90 days */}
          <div
            className={cn(
              "rounded-xl p-2.5 backdrop-blur-sm border transition-colors",
              expiringCount > 0
                ? "bg-amber-500/15 border-amber-500/30 text-amber-200"
                : "bg-white/5 border-white/5 text-slate-400",
            )}
          >
            <p className="text-[10px] sm:text-xs uppercase tracking-wider">
              Expiring Soon
            </p>
            <p className="text-base sm:text-lg font-bold text-white mt-0.5">
              {expiringCount}{" "}
              <span className="text-[10px] font-normal hidden sm:inline">
                need FEFO
              </span>
            </p>
          </div>

          {/* Low Stock */}
          <div
            className={cn(
              "rounded-xl p-2.5 backdrop-blur-sm border transition-colors",
              lowStockCount > 0
                ? "bg-rose-500/15 border-rose-500/30 text-rose-200"
                : "bg-white/5 border-white/5 text-slate-400",
            )}
          >
            <p className="text-[10px] sm:text-xs uppercase tracking-wider">
              Low Stock
            </p>
            <p className="text-base sm:text-lg font-bold text-white mt-0.5">
              {lowStockCount}{" "}
              <span className="text-[10px] font-normal hidden sm:inline">
                items &le;10
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. URGENT CLINICAL ATTENTION BANNER (If Critical Expiries Exist)          */}
      {/* ========================================================================= */}
      {criticalExpiries.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300/80 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-500/20 p-2 text-amber-800 dark:text-amber-300 shrink-0">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {criticalExpiries.length} batch(es) expire within 30 days!
              </p>
              <p className="text-xs text-amber-900/80 dark:text-amber-300/80 mt-0.5">
                Prioritize dispensing these nearest-expiry medications first (FEFO).
              </p>
            </div>
          </div>
          <Link href="/pos" className="shrink-0">
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-sm">
              Open POS
            </Button>
          </Link>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. CORE ACTION CARDS GRID (Fintech / Banking-App Style Action Hub)        */}
      {/* ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Quick Actions
          </h2>
          <span className="text-xs text-muted-foreground">Tap to open</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {/* ACTION 1: DISPENSE (POS) - Primary Highlighted Card */}
          <Link
            href="/pos"
            className="group relative flex flex-col justify-between rounded-2xl border-2 border-primary/40 bg-card p-4 sm:p-5 shadow-sm transition-all hover:border-primary hover:shadow-md active:scale-[0.98]"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-2xl bg-primary/12 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <ShoppingCart className="size-6" />
              </div>
              <Badge variant="success" className="text-[10px] font-semibold">
                Quick POS
              </Badge>
            </div>
            <div className="mt-4">
              <h3 className="text-sm sm:text-base font-bold text-foreground group-hover:text-primary transition-colors">
                Dispense Drug
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                Scan barcode or search name with automatic FEFO batch allocation.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary">
              <span>Start checkout</span>
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          {/* ACTION 2: RECEIVE STOCK (Delivery Ingestion) */}
          {canReceive ? (
            <Link
              href="/receive"
              className="group flex flex-col justify-between rounded-2xl border bg-card p-4 sm:p-5 shadow-sm transition-all hover:border-border hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex items-start justify-between">
                <div className="rounded-2xl bg-blue-500/10 p-3 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <PackagePlus className="size-6" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  Stock In
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-sm sm:text-base font-bold text-foreground">
                  Receive Delivery
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  Log new stock via CSV invoice, Excel, or camera delivery note photo.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <span>Add delivery</span>
                <ChevronRight className="size-3.5" />
              </div>
            </Link>
          ) : (
            <Link
              href="/pos"
              className="group flex flex-col justify-between rounded-2xl border bg-card p-4 sm:p-5 shadow-sm transition-all hover:border-border active:scale-[0.98]"
            >
              <div className="rounded-2xl bg-secondary p-3 text-secondary-foreground">
                <Package className="size-6" />
              </div>
              <div className="mt-4">
                <h3 className="text-sm sm:text-base font-bold text-foreground">
                  Stock Catalog
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  Check available pack quantities and retail prices.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <span>View catalog</span>
                <ChevronRight className="size-3.5" />
              </div>
            </Link>
          )}

          {/* ACTION 3: TODAY'S SALES */}
          {canViewSales && (
            <Link
              href="/sales"
              className="group flex flex-col justify-between rounded-2xl border bg-card p-4 sm:p-5 shadow-sm transition-all hover:border-border hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex items-start justify-between">
                <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <TrendingUp className="size-6" />
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                  {todaySalesCount} today
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-sm sm:text-base font-bold text-foreground">
                  Sales Ledger
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  Review today&apos;s receipts, voided lines, and top fast-moving drugs.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span>View transactions</span>
                <ChevronRight className="size-3.5" />
              </div>
            </Link>
          )}

          {/* ACTION 4: EXPIRY MONITOR & FEFO */}
          <a
            href="#expiry-inventory-section"
            className="group flex flex-col justify-between rounded-2xl border bg-card p-4 sm:p-5 shadow-sm transition-all hover:border-border hover:shadow-md active:scale-[0.98]"
          >
            <div className="flex items-start justify-between">
              <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-600 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <Timer className="size-6" />
              </div>
              {expiringCount > 0 ? (
                <Badge variant="warning" className="text-[10px]">
                  {expiringCount} soon
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  All fresh
                </Badge>
              )}
            </div>
            <div className="mt-4">
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                Expiry Manager
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                Inspect 90-day expiry risk and FEFO inventory pull sequence.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <span>View batch monitor</span>
              <ChevronRight className="size-3.5" />
            </div>
          </a>

          {/* ACTION 5: PROCUREMENT & REORDERS */}
          {canProcure && (
            <Link
              href="/procurement"
              className="group flex flex-col justify-between rounded-2xl border bg-card p-4 sm:p-5 shadow-sm transition-all hover:border-border hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex items-start justify-between">
                <div className="rounded-2xl bg-indigo-500/10 p-3 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <PackageSearch className="size-6" />
                </div>
                {lowStockCount > 0 ? (
                  <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-full">
                    {lowStockCount} low stock
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    Reorders
                  </span>
                )}
              </div>
              <div className="mt-4">
                <h3 className="text-sm sm:text-base font-bold text-foreground">
                  Procurement
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  Generate restock purchase orders and manage supplier contacts.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                <span>Manage orders</span>
                <ChevronRight className="size-3.5" />
              </div>
            </Link>
          )}

          {/* ACTION 6: REPORTS & ANALYTICS or TEAM */}
          {canViewReports ? (
            <Link
              href="/reports"
              className="group flex flex-col justify-between rounded-2xl border bg-card p-4 sm:p-5 shadow-sm transition-all hover:border-border hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex items-start justify-between">
                <div className="rounded-2xl bg-purple-500/10 p-3 text-purple-600 dark:text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <FileText className="size-6" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  Audit
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-sm sm:text-base font-bold text-foreground">
                  Reports &amp; PDF
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  Generate weekly and monthly sales &amp; stock movement printouts.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400">
                <span>View reports</span>
                <ChevronRight className="size-3.5" />
              </div>
            </Link>
          ) : canManageTeam ? (
            <Link
              href="/settings/team"
              className="group flex flex-col justify-between rounded-2xl border bg-card p-4 sm:p-5 shadow-sm transition-all hover:border-border hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex items-start justify-between">
                <div className="rounded-2xl bg-slate-500/10 p-3 text-slate-600 dark:text-slate-400 group-hover:bg-slate-600 group-hover:text-white transition-colors">
                  <Users className="size-6" />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  Team
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-sm sm:text-base font-bold text-foreground">
                  Staff &amp; Seats
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  Manage dispenser and deputy credentials and active logins.
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>Manage staff</span>
                <ChevronRight className="size-3.5" />
              </div>
            </Link>
          ) : null}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. RECENT ACTIVITY TICKER (Recent Sales Feed - Banking Statement Style)   */}
      {/* ========================================================================= */}
      {canViewSales && salesData?.todaySales && salesData.todaySales.length > 0 && (
        <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3 border-b pb-3">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                Today&apos;s Recent Transactions
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
            {salesData.todaySales.slice(0, 4).map((sale) => {
              const time = new Date(sale.createdAt).toLocaleTimeString("en-KE", {
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <div
                  key={sale.id}
                  className="flex items-center justify-between py-2.5 hover:bg-muted/40 px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
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
                  <span className="text-sm font-bold text-foreground">
                    {formatKes(sale.totalAmount)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 5. DEEP BATCH INVENTORY MONITOR (Existing Stock Dashboard Embedded)      */}
      {/* ========================================================================= */}
      <div id="expiry-inventory-section" className="pt-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Inventory &amp; FEFO Priority Monitor
            </h3>
            <p className="text-xs text-muted-foreground">
              Batch-level tracking with automatic expiry sequencing
            </p>
          </div>
        </div>
        <StockDashboard />
      </div>
    </div>
  );
}
