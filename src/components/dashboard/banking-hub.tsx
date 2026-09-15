import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  FileText,
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
import { Button } from "@/components/ui/button";
import { StockDashboard } from "@/components/dashboard/stock-dashboard";
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

export async function BankingHub() {
  const session = await getSession();
  const canViewSales = session ? hasPermission(session, "sales.view") : false;
  const canReceive = session ? hasPermission(session, "receive.stock") : false;
  const canProcure = session ? hasPermission(session, "procurement.manage") : false;
  const canViewReports = session ? hasPermission(session, "reports.view") : false;
  const canManageTeam = session ? hasPermission(session, "facility.manage_team") : false;

  // Parallel data fetching
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
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto pb-12 pt-1 sm:pt-2">
      {/* ========================================================================= */}
      {/* 1. HERO ACCOUNT / TELEMETRY CARD (With Privacy Toggle & Clean Header)     */}
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
      {/* 2. URGENT CLINICAL ATTENTION BANNER (If Critical Expiries ≤ 30 Days)     */}
      {/* ========================================================================= */}
      {criticalExpiries.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300/80 bg-amber-50/90 p-3.5 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="rounded-xl bg-amber-500/20 p-2 text-amber-800 dark:text-amber-300 shrink-0">
              <AlertTriangle className="size-4 sm:size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold truncate">
                {criticalExpiries.length} batch(es) expire within 30 days
              </p>
              <p className="text-[11px] text-amber-900/80 dark:text-amber-300/80 truncate">
                Prioritize dispensing nearest expiry first (FEFO)
              </p>
            </div>
          </div>
          <Link href="/pos" className="shrink-0">
            <Button size="sm" className="h-8 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-xs">
              Open POS
            </Button>
          </Link>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TACTILE BANKING QUICK ACTION GRID (Compact 4-Column Layout)            */}
      {/* ========================================================================= */}
      <section>
        <div className="flex items-center justify-between mb-2.5 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Counter Actions
          </h2>
          <span className="text-[11px] text-muted-foreground">Quick access</span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-3">
          {/* ACTION 1: DISPENSE (POS) */}
          <Link
            href="/pos"
            className="group flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-primary/60 hover:shadow-sm active:scale-95 transition-all text-center relative"
          >
            <div className="size-11 sm:size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <ShoppingCart className="size-5 sm:size-6" />
            </div>
            <span className="mt-2 text-xs font-bold text-foreground group-hover:text-primary transition-colors">
              Dispense
            </span>
            <span className="text-[10px] text-muted-foreground">POS</span>
          </Link>

          {/* ACTION 2: RECEIVE STOCK (Delivery Ingestion) */}
          {canReceive ? (
            <Link
              href="/receive"
              className="group flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-blue-500/50 hover:shadow-sm active:scale-95 transition-all text-center relative"
            >
              <div className="size-11 sm:size-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <PackagePlus className="size-5 sm:size-6" />
              </div>
              <span className="mt-2 text-xs font-bold text-foreground">
                Receive
              </span>
              <span className="text-[10px] text-muted-foreground">Stock In</span>
            </Link>
          ) : null}

          {/* ACTION 3: SALES LEDGER */}
          {canViewSales ? (
            <Link
              href="/sales"
              className="group flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-emerald-500/50 hover:shadow-sm active:scale-95 transition-all text-center relative"
            >
              <div className="size-11 sm:size-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <TrendingUp className="size-5 sm:size-6" />
              </div>
              {todaySalesCount > 0 && (
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-emerald-500 ring-2 ring-card" />
              )}
              <span className="mt-2 text-xs font-bold text-foreground">
                Sales
              </span>
              <span className="text-[10px] text-muted-foreground">{todaySalesCount} today</span>
            </Link>
          ) : null}

          {/* ACTION 4: EXPIRY MONITOR & FEFO */}
          <a
            href="#expiry-inventory-section"
            className="group flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-amber-500/50 hover:shadow-sm active:scale-95 transition-all text-center relative"
          >
            <div
              className={cn(
                "size-11 sm:size-12 rounded-2xl flex items-center justify-center transition-colors",
                expiringCount > 0
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 group-hover:bg-amber-500 group-hover:text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Timer className="size-5 sm:size-6" />
            </div>
            {expiringCount > 0 && (
              <span className="absolute top-1.5 right-1.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500 text-white shadow-xs">
                {expiringCount}
              </span>
            )}
            <span className="mt-2 text-xs font-bold text-foreground">
              Expiries
            </span>
            <span className="text-[10px] text-muted-foreground">
              {expiringCount > 0 ? "FEFO risk" : "Fresh"}
            </span>
          </a>

          {/* ACTION 5: PROCUREMENT & REORDERS */}
          {canProcure ? (
            <Link
              href="/procurement"
              className="group flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-rose-500/50 hover:shadow-sm active:scale-95 transition-all text-center relative"
            >
              <div
                className={cn(
                  "size-11 sm:size-12 rounded-2xl flex items-center justify-center transition-colors",
                  lowStockCount > 0
                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 group-hover:bg-rose-600 group-hover:text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <PackageSearch className="size-5 sm:size-6" />
              </div>
              {lowStockCount > 0 && (
                <span className="absolute top-1.5 right-1.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white shadow-xs">
                  {lowStockCount}
                </span>
              )}
              <span className="mt-2 text-xs font-bold text-foreground">
                Reorders
              </span>
              <span className="text-[10px] text-muted-foreground">
                {lowStockCount > 0 ? `${lowStockCount} low` : "Stocked"}
              </span>
            </Link>
          ) : null}

          {/* ACTION 6: REPORTS / AUDIT or TEAM */}
          {canViewReports ? (
            <Link
              href="/reports"
              className="group flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-primary/50 hover:shadow-sm active:scale-95 transition-all text-center relative"
            >
              <div className="size-11 sm:size-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                <FileText className="size-5 sm:size-6" />
              </div>
              <span className="mt-2 text-xs font-bold text-foreground">
                Reports
              </span>
              <span className="text-[10px] text-muted-foreground">PDF Audit</span>
            </Link>
          ) : canManageTeam ? (
            <Link
              href="/settings/team"
              className="group flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-primary/50 hover:shadow-sm active:scale-95 transition-all text-center relative"
            >
              <div className="size-11 sm:size-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                <Users className="size-5 sm:size-6" />
              </div>
              <span className="mt-2 text-xs font-bold text-foreground">
                Team
              </span>
              <span className="text-[10px] text-muted-foreground">Staff seats</span>
            </Link>
          ) : null}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. RECENT ACTIVITY TICKER (Recent Sales Feed - Statement Style)           */}
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
            {salesData.todaySales.slice(0, 4).map((sale) => {
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
      {/* 5. DEEP BATCH INVENTORY MONITOR (Existing Stock Dashboard Embedded)      */}
      {/* ========================================================================= */}
      <div id="expiry-inventory-section" className="pt-2 sm:pt-4">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-foreground">
              Inventory &amp; FEFO Priority Monitor
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Batch-level tracking with automatic expiry sequencing
            </p>
          </div>
        </div>
        <StockDashboard />
      </div>
    </div>
  );
}
