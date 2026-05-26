import type { AppPermission } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/permissions";
import { getSession, requireSession } from "@/lib/auth/session";
import type { SessionPayload } from "@/lib/auth/session-types";
import { resolveTenantDb, type TenantDb } from "@/lib/tenant-db";
import { AppError } from "@/lib/errors";

export async function requireAuth(
  permission?: AppPermission,
): Promise<SessionPayload> {
  const session = await requireSession();
  if (permission) {
    requirePermission(session, permission);
  }
  return session;
}

export async function requirePlatformAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!session.isPlatformAdmin) {
    throw new AppError("Platform administrator access required", "FORBIDDEN");
  }
  return session;
}

export async function requireFacilityOwner(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.isPlatformAdmin || session.role !== "OWNER") {
    throw new AppError("Facility owner access required", "FORBIDDEN");
  }
  if (!session.tenantId) {
    throw new AppError("No facility assigned", "FORBIDDEN");
  }
  return session;
}

export async function requireTenantContext(
  permission: AppPermission,
): Promise<TenantDb & { session: SessionPayload }> {
  const session = await requireAuth(permission);
  if (session.isPlatformAdmin) {
    throw new AppError("Use the admin console for this action", "FORBIDDEN");
  }
  const { tenantId, db } = await resolveTenantDb(session);
  return { tenantId, db, session };
}

export async function getOptionalSession(): Promise<SessionPayload | null> {
  return getSession();
}
