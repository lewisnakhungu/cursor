"use client";

import Link from "next/link";
import { LayoutDashboard, Menu, PackagePlus, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  canAccessNav,
  type NavItemId,
} from "@/lib/auth/permissions";
import type { SessionPayload } from "@/lib/auth/session-types";

type TabDef = {
  navId: NavItemId;
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

/** Primary mobile destinations — rest stay in the slide-out menu. */
const MOBILE_TABS: TabDef[] = [
  {
    navId: "dashboard",
    href: "/dashboard",
    label: "Home",
    icon: LayoutDashboard,
  },
  {
    navId: "pos",
    href: "/pos",
    label: "Dispense",
    icon: ShoppingCart,
  },
  {
    navId: "receive",
    href: "/receive",
    label: "Receive",
    icon: PackagePlus,
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

type MobileBottomNavProps = {
  session: SessionPayload;
  pathname: string;
  onOpenMenu: () => void;
};

export function MobileBottomNav({
  session,
  pathname,
  onOpenMenu,
}: MobileBottomNavProps) {
  const tabs = MOBILE_TABS.filter((tab) => canAccessNav(session, tab.navId));

  if (tabs.length === 0) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-[hsl(var(--sidebar-bg))]/95 backdrop-blur-md lg:hidden"
      aria-label="Quick navigation"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="flex h-14 items-stretch">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={cn("size-5", active && "stroke-[2.5]")}
                  aria-hidden
                />
                <span className="truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Menu className="size-5" aria-hidden />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
