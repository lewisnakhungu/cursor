"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Menu,
  PackagePlus,
  ShoppingCart,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const FACILITY_NAME =
  process.env.NEXT_PUBLIC_FACILITY_NAME ?? "AfyaSmart Facility";

const MOBILE_HEADER =
  "calc(3.5rem + env(safe-area-inset-top, 0px))" as const;

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
  {
    href: "/insights",
    label: "Insights",
    icon: ClipboardList,
    description: "Restock & sell-through",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: FileText,
    description: "Print weekly / monthly",
  },
] as const;

function SidebarBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("border-b border-border/60 px-4", compact ? "py-3" : "py-5")}>
      <div className="flex items-center gap-2">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Activity className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            AfyaSmart-Stock
          </p>
          {!compact && (
            <p className="truncate text-[11px] text-muted-foreground">
              {FACILITY_NAME}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav
      className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3"
      aria-label="Main navigation"
    >
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
            onClick={onNavigate}
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
  );
}

function SidebarFooter() {
  return (
    <div className="hidden border-t border-border/60 p-4 text-[11px] text-muted-foreground lg:block">
      <p className="font-medium text-foreground">Keyboard tips</p>
      <p className="mt-1 leading-relaxed">
        Search: type 2+ chars · POS: Esc clears search
      </p>
    </div>
  );
}

type AppShellProps = {
  children: React.ReactNode;
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const activeNav = NAV.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  );

  return (
    <div className="min-h-screen bg-[hsl(var(--shell-bg))]">
      {/* Mobile top bar */}
      <header
        className="fixed inset-x-0 top-0 z-50 flex items-center gap-2 border-b border-border/80 bg-[hsl(var(--sidebar-bg))]/95 px-3 backdrop-blur-md lg:hidden"
        style={{
          height: MOBILE_HEADER,
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-nav-drawer"
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          {mobileNavOpen ? (
            <X className="size-5" aria-hidden />
          ) : (
            <Menu className="size-5" aria-hidden />
          )}
          <span className="sr-only">
            {mobileNavOpen ? "Close menu" : "Open menu"}
          </span>
        </Button>
        <div className="min-w-0 flex-1 pe-2">
          <p className="truncate text-sm font-semibold leading-tight">
            {title ?? activeNav?.label ?? "AfyaSmart-Stock"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {subtitle ?? FACILITY_NAME}
          </p>
        </div>
      </header>

      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Close menu"
          onClick={closeMobileNav}
        />
      )}

      <aside
        id="mobile-nav-drawer"
        className={cn(
          "fixed bottom-0 left-0 top-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-border/80 bg-[hsl(var(--sidebar-bg))] shadow-xl transition-transform duration-200 ease-out lg:hidden",
          mobileNavOpen
            ? "translate-x-0"
            : "pointer-events-none -translate-x-full",
        )}
        aria-hidden={!mobileNavOpen}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center justify-between border-b border-border/60 pe-1">
          <div className="min-w-0 flex-1">
            <SidebarBrand compact />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mr-2 size-10 shrink-0"
            onClick={closeMobileNav}
          >
            <X className="size-5" />
            <span className="sr-only">Close menu</span>
          </Button>
        </div>
        <SidebarNav pathname={pathname} onNavigate={closeMobileNav} />
      </aside>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[15.5rem] flex-col border-r border-border/80 bg-[hsl(var(--sidebar-bg))] shadow-sm lg:flex">
        <SidebarBrand />
        <SidebarNav pathname={pathname} />
        <SidebarFooter />
      </aside>

      <div
        className="flex min-h-screen flex-col pt-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:pl-[15.5rem] lg:pt-0"
      >
        <div className="flex min-h-screen flex-col">
          {(title || actions) && (
            <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
                <div className="min-w-0 max-lg:sr-only">
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
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end [&_button]:w-full sm:[&_button]:w-auto">
                    {actions}
                  </div>
                )}
              </div>
            </header>
          )}

          <main
            className={cn(
              "flex-1 px-4 py-4 sm:px-6 sm:py-6",
              "pb-[max(1rem,env(safe-area-inset-bottom))]",
              wide ? "w-full max-w-[1600px]" : "mx-auto w-full max-w-6xl",
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
