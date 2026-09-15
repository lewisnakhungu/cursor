"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { formatKes } from "@/lib/money";
import { cn } from "@/lib/utils";

interface HeroTelemetryCardProps {
  facilityName: string;
  userName: string;
  userRole: string;
  todayRevenue: number;
  todaySalesCount: number;
  activeBatchesCount: number;
  expiringCount: number;
  lowStockCount: number;
  canViewSales: boolean;
  dateHeader: string;
  greeting: string;
}

const STORAGE_KEY = "afyasmart_hide_revenue";

export function HeroTelemetryCard({
  facilityName,
  userName,
  userRole,
  todayRevenue,
  todaySalesCount,
  activeBatchesCount,
  expiringCount,
  lowStockCount,
  canViewSales,
  dateHeader,
  greeting,
}: HeroTelemetryCardProps) {
  const [hideRevenue, setHideRevenue] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "true") {
        setHideRevenue(true);
      }
    } catch {
      // Ignore localStorage read errors in private browsing
    }
  }, []);

  const toggleHideRevenue = () => {
    const next = !hideRevenue;
    setHideRevenue(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Ignore localStorage write errors
    }
  };

  const isHidden = mounted && hideRevenue;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-950 p-4 sm:p-6 text-white shadow-xl border border-emerald-500/20">
      {/* Subtle ambient lighting glows */}
      <div className="absolute -top-16 -right-16 size-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 size-48 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />

      {/* Top bar inside hero */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="size-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-xs font-semibold tracking-wider uppercase text-emerald-300 truncate">
            {facilityName}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-slate-300 font-medium">
            {dateHeader}
          </span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-emerald-200 uppercase tracking-wider">
            {userRole}
          </span>
        </div>
      </div>

      {/* Main greeting & balance section */}
      <div className="pt-4 pb-2">
        <p className="text-xs sm:text-sm font-medium text-emerald-200/90">
          {greeting}, <span className="text-white font-semibold">{userName}</span>
        </p>

        {canViewSales ? (
          <div className="mt-2 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Today&apos;s Dispensed Revenue
                </span>
                <button
                  type="button"
                  onClick={toggleHideRevenue}
                  className="rounded-md p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-1 focus:ring-white/40"
                  title={isHidden ? "Show revenue" : "Hide revenue"}
                  aria-label={isHidden ? "Show revenue" : "Hide revenue"}
                >
                  {isHidden ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </button>
              </div>
              <p className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mt-0.5 font-mono">
                {isHidden ? "Ksh ••••••" : formatKes(todayRevenue)}
              </p>
            </div>
            <p className="text-xs text-emerald-300 font-medium sm:text-right">
              {todaySalesCount} sale{todaySalesCount === 1 ? "" : "s"} completed today
            </p>
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Point of Sale Terminal
            </p>
            <p className="text-xl sm:text-2xl font-bold text-white mt-0.5">
              Dispense Station Ready
            </p>
          </div>
        )}
      </div>

      {/* Live status telemetry chips */}
      <div className="mt-3 grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-center sm:text-left">
        {/* Batches in stock */}
        <div className="rounded-xl bg-white/5 p-2 sm:p-2.5 backdrop-blur-sm border border-white/5">
          <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-medium">
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
            "rounded-xl p-2 sm:p-2.5 backdrop-blur-sm border transition-colors",
            expiringCount > 0
              ? "bg-amber-500/20 border-amber-500/40 text-amber-200"
              : "bg-white/5 border-white/5 text-slate-400",
          )}
        >
          <p className="text-[10px] sm:text-xs uppercase tracking-wider font-medium">
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
            "rounded-xl p-2 sm:p-2.5 backdrop-blur-sm border transition-colors",
            lowStockCount > 0
              ? "bg-rose-500/20 border-rose-500/40 text-rose-200"
              : "bg-white/5 border-white/5 text-slate-400",
          )}
        >
          <p className="text-[10px] sm:text-xs uppercase tracking-wider font-medium">
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
  );
}
