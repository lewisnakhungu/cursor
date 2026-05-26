import type { TenantRole } from "@/generated/prisma/client";
import type { SessionPayload } from "@/lib/auth/session-types";
import { AppError } from "@/lib/errors";

export const MAX_FACILITY_STAFF = 3;

export type AppPermission =
  | "platform.admin"
  | "facility.manage_team"
  | "dashboard.view"
  | "receive.stock"
  | "dispense.sale"
  | "sales.view"
  | "insights.view"
  | "reports.view";

const ROLE_PERMISSIONS: Record<TenantRole, ReadonlySet<AppPermission>> = {
  OWNER: new Set<AppPermission>([
    "facility.manage_team",
    "dashboard.view",
    "receive.stock",
    "dispense.sale",
    "sales.view",
    "insights.view",
    "reports.view",
  ]),
  DEPUTY: new Set<AppPermission>([
    "dashboard.view",
    "receive.stock",
    "dispense.sale",
    "sales.view",
    "insights.view",
    "reports.view",
  ]),
  DISPENSER: new Set<AppPermission>(["dashboard.view", "dispense.sale"]),
};

export function permissionsForRole(
  role: TenantRole | null,
): Set<AppPermission> {
  if (!role) return new Set();
  return new Set(ROLE_PERMISSIONS[role]);
}

export function hasPermission(
  session: SessionPayload,
  permission: AppPermission,
): boolean {
  if (session.isPlatformAdmin) {
    return permission === "platform.admin";
  }
  if (!session.activeRole) return false;
  return permissionsForRole(session.activeRole).has(permission);
}

export function requirePermission(
  session: SessionPayload,
  permission: AppPermission,
): void {
  if (!hasPermission(session, permission)) {
    throw new AppError("You do not have permission for this action", "FORBIDDEN");
  }
}

export type NavItemId =
  | "dashboard"
  | "receive"
  | "pos"
  | "sales"
  | "insights"
  | "reports"
  | "team"
  | "admin";

const NAV_PERMISSION: Record<NavItemId, AppPermission | "platform.admin"> = {
  dashboard: "dashboard.view",
  receive: "receive.stock",
  pos: "dispense.sale",
  sales: "sales.view",
  insights: "insights.view",
  reports: "reports.view",
  team: "facility.manage_team",
  admin: "platform.admin",
};

export function canAccessNav(
  session: SessionPayload,
  navId: NavItemId,
): boolean {
  const perm = NAV_PERMISSION[navId];
  if (perm === "platform.admin") {
    return session.isPlatformAdmin;
  }
  return hasPermission(session, perm);
}

export function pathnameToNavId(pathname: string): NavItemId | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/settings/team")) return "team";
  if (pathname === "/") return "dashboard";
  if (pathname.startsWith("/receive")) return "receive";
  if (pathname.startsWith("/pos")) return "pos";
  if (pathname.startsWith("/sales")) return "sales";
  if (pathname.startsWith("/insights")) return "insights";
  if (pathname.startsWith("/reports")) return "reports";
  return null;
}

export function canAccessPath(
  session: SessionPayload,
  pathname: string,
): boolean {
  if (pathname.startsWith("/login")) return true;
  if (session.isPlatformAdmin) {
    return pathname.startsWith("/admin");
  }
  const navId = pathnameToNavId(pathname);
  if (!navId) return true;
  return canAccessNav(session, navId);
}
