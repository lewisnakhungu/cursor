"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PackagePlus,
  ShoppingCart,
  Activity,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FACILITY_NAME =
  process.env.NEXT_PUBLIC_FACILITY_NAME ?? "AfyaSmart Facility";

const NAV = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Expiry & stock overview",
  },
  {
    href: "/receive",
    label: "Receive",
    icon: PackagePlus,
    description: "Restock batches",
  },
  {
    href: "/pos",
    label: "Dispense",
    icon: ShoppingCart,
    description: "Point of sale",
  },
  {
    href: "/sales",
    label: "Sales",
    icon: BarChart3,
    description: "Today & top drugs",
  },
] as const;

type AppShellProps = {
  children: React.ReactNode;
  /** Wider main column for POS */
  wide?: boolean;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

export function AppShell({
  children,
  wide = false,
  title,
  subtitle,
  actions,
}: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[hsl(var(--shell-bg))]">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[15.5rem] flex-col border-r border-border/80 bg-[hsl(var(--sidebar-bg))] shadow-sm">
        <div className="border-b border-border/60 px-4 py-5">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                AfyaSmart-Stock
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {FACILITY_NAME}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Main navigation">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground hover:bg-accent",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 size-5 shrink-0",
                    active ? "text-primary-foreground" : "text-primary",
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span
                    className={cn(
                      "block text-[11px] leading-snug",
                      active
                        ? "text-primary-foreground/85"
                        : "text-muted-foreground",
                    )}
                  >
                    {item.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border/60 p-4 text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground">Keyboard tips</p>
          <p className="mt-1 leading-relaxed">
            Search: type 2+ chars · POS: Esc clears search
          </p>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col pl-[15.5rem]">
        {(title || actions) && (
          <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 px-6 py-4 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                {title && (
                  <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
              {actions && (
                <div className="flex flex-wrap items-center gap-2">
                  {actions}
                </div>
              )}
            </div>
          </header>
        )}

        <main
          className={cn(
            "flex-1 px-6 py-6",
            wide ? "max-w-[1600px]" : "mx-auto w-full max-w-6xl",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
