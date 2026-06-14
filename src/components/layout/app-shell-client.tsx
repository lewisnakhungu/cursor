"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { AfyaSmartLogo } from "@/components/brand/afyasmart-logo";
import {
  BarChart3,
  Building2,
  ClipboardList,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  PackagePlus,
  ShoppingCart,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SessionPayload } from "@/lib/auth/session-types";
import {
  canAccessNav,
  type NavItemId,
} from "@/lib/auth/permissions";
import { logout } from "@/lib/actions/auth";
import { getActiveFacilityName } from "@/lib/auth/session-types";
import { FacilitySwitcher } from "@/components/layout/facility-switcher";
import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";
import { SyncStatusBadge } from "@/components/layout/sync-status-badge";

const MOBILE_HEADER =
  "calc(3.5rem + env(safe-area-inset-top, 0px))" as const;

type NavEntry = {
  navId: NavItemId;
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  description: string;
};

const ALL_NAV: NavEntry[] = [
  {
    navId: "admin",
    href: "/admin",
    label: "Admin",
    icon: Building2,
    description: "All facilities",
  },
  {
    navId: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Expiry & stock overview",
  },
  {
    navId: "receive",
    href: "/receive",
    label: "Receive",
    icon: PackagePlus,
    description: "Restock batches",
  },
  {
    navId: "procurement",
    href: "/procurement",
    label: "Procurement",
    icon: PackageSearch,
    description: "Reorder lists & print",
  },
  {
    navId: "pos",
    href: "/pos",
    label: "Dispense",
    icon: ShoppingCart,
    description: "Point of sale",
  },
  {
    navId: "sales",
    href: "/sales",
    label: "Sales",
    icon: BarChart3,
    description: "Today & top drugs",
  },
  {
    navId: "insights",
    href: "/insights",
    label: "Insights",
    icon: ClipboardList,
    description: "Restock & sell-through",
  },
  {
    navId: "reports",
    href: "/reports",
    label: "Reports",
    icon: FileText,
    description: "Print weekly / monthly",
  },
  {
    navId: "team",
    href: "/settings/team",
    label: "Team",
    icon: Users,
    description: "Staff accounts & roles",
  },
];

function SidebarBrand({
  session,
  compact = false,
}: {
  session: SessionPayload;
  compact?: boolean;
}) {
  const subtitle = session.isPlatformAdmin
    ? "Platform admin"
    : (getActiveFacilityName(session) ?? "Facility");

  return (
    <div
      className={cn("border-b border-border/60 px-4", compact ? "py-3" : "py-5")}
    >
      <div className="flex items-center gap-2">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <AfyaSmartLogo size={28} variant="onPrimary" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            AfyaSmart-Stock
          </p>
          {!compact && (
            <p className="truncate text-[11px] text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarNav({
  pathname,
  navItems,
  onNavigate,
}: {
  pathname: string;
  navItems: NavEntry[];
  onNavigate?: () => void;
}) {
  return (
    <nav
      className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3"
      aria-label="Main navigation"
    >
      {navItems.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
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

function SessionFooter({
  session,
  onLogout,
  onChangePassword,
  pending,
}: {
  session: SessionPayload;
  onLogout: () => void;
  onChangePassword: () => void;
  pending: boolean;
}) {
  const roleLabel = session.isPlatformAdmin
    ? "Super user"
    : (session.activeRole ?? "Staff");

  return (
    <div className="border-t border-border/60 p-3">
      <p className="truncate text-xs font-medium">{session.email}</p>
      <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 w-full justify-start gap-2"
        disabled={pending}
        onClick={onChangePassword}
      >
        <KeyRound className="size-4" aria-hidden />
        Change password
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1 w-full gap-2"
        disabled={pending}
        onClick={onLogout}
      >
        <LogOut className="size-4" aria-hidden />
        Sign out
      </Button>
    </div>
  );
}

export type AppShellClientProps = {
  session: SessionPayload;
  children: React.ReactNode;
  wide?: boolean;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

export function AppShellClient({
  session,
  children,
  wide = false,
  title,
  subtitle,
  actions,
}: AppShellClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const navItems = useMemo(
    () => ALL_NAV.filter((item) => canAccessNav(session, item.navId)),
    [session],
  );

  const facilityLabel =
    getActiveFacilityName(session) ?? "AfyaSmart Facility";

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

  const drawerRef = useRef<HTMLElement | null>(null);

  // Drawer a11y (QA-M3, QA-L2): Escape closes, Tab cycles within the drawer.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const drawer = drawerRef.current;
    const focusables = () =>
      drawer?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [];

    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileNav();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen, closeMobileNav]);

  const activeNav = navItems.find((item) =>
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href),
  );

  const handleLogout = () => {
    startTransition(async () => {
      await logout();
      router.push("/login");
      router.refresh();
    });
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--shell-bg))]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>
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
            {subtitle ?? facilityLabel}
          </p>
        </div>
        <FacilitySwitcher session={session} className="shrink-0 max-w-[11rem]" />
        {session.activeFacilityId && (
          <SyncStatusBadge tenantId={session.activeFacilityId} />
        )}
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
        ref={drawerRef}
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
            <SidebarBrand session={session} compact />
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
        <SidebarNav
          pathname={pathname}
          navItems={navItems}
          onNavigate={closeMobileNav}
        />
        <SessionFooter
          session={session}
          onLogout={handleLogout}
          onChangePassword={() => {
            closeMobileNav();
            setChangePasswordOpen(true);
          }}
          pending={pending}
        />
      </aside>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[15.5rem] flex-col border-r border-border/80 bg-[hsl(var(--sidebar-bg))] shadow-sm lg:flex">
        <SidebarBrand session={session} />
        <SidebarNav pathname={pathname} navItems={navItems} />
        <SessionFooter
          session={session}
          onLogout={handleLogout}
          onChangePassword={() => setChangePasswordOpen(true)}
          pending={pending}
        />
      </aside>

      <ChangePasswordDialog
        open={changePasswordOpen || session.mustChangePassword}
        onOpenChange={(open) => {
          if (!session.mustChangePassword) setChangePasswordOpen(open);
        }}
        forced={session.mustChangePassword}
      />

      <div className="flex min-h-screen flex-col pt-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:pl-[15.5rem] lg:pt-0">
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
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
                  <FacilitySwitcher
                    session={session}
                    className="hidden lg:block lg:max-w-[14rem]"
                  />
                  {actions && (
                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center [&_button]:w-full sm:[&_button]:w-auto">
                      {actions}
                    </div>
                  )}
                </div>
              </div>
            </header>
          )}

          <main
            id="main-content"
            tabIndex={-1}
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
