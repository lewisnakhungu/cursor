import type { AppPermission } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/permissions";
import { getSession, requireSession } from "@/lib/auth/session";
import type { SessionPayload } from "@/lib/auth/session-types";
import { resolveTenantDb, type TenantDb } from "@/lib/tenant-db";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

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
  if (session.isPlatformAdmin || session.activeRole !== "OWNER") {
    throw new AppError("Facility owner access required", "FORBIDDEN");
  }
  if (!session.activeFacilityId) {
    throw new AppError("No facility assigned", "FORBIDDEN");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.activeFacilityId },
    select: { status: true, suspendedReason: true },
  });
  if (!tenant || tenant.status !== "ACTIVE") {
    throw new AppError(
      tenant?.suspendedReason ?? "Facility account is not active",
      "FORBIDDEN",
    );
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

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.activeFacilityId! },
    select: {
      status: true,
      suspendedReason: true,
      reportsEnabled: true,
      procurementEnabled: true,
    },
  });

  if (!tenant || tenant.status === "DELETED") {
    throw new AppError("Facility account not found or deactivated", "FORBIDDEN");
  }

  if (tenant.status === "SUSPENDED") {
    throw new AppError(
      tenant.suspendedReason
        ? `Facility suspended: ${tenant.suspendedReason}`
        : "This facility account is suspended. Contact support.",
      "FORBIDDEN",
    );
  }

  if (permission === "reports.view" && !tenant.reportsEnabled) {
    throw new AppError(
      "Reports and analytics are not enabled for your subscription plan.",
      "FORBIDDEN",
    );
  }

  if (permission === "procurement.manage" && !tenant.procurementEnabled) {
    throw new AppError(
      "Procurement is not enabled for your subscription plan.",
      "FORBIDDEN",
    );
  }

  const tenantDb = await resolveTenantDb(session);
  return { ...tenantDb, session };
}

export async function getOptionalSession(): Promise<SessionPayload | null> {
  return getSession();
}
