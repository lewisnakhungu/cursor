import type { TenantRole } from "@/generated/prisma/client";

/** One facility the user belongs to. */
export type FacilityMembership = {
  facilityId: string;
  facilityName: string;
  role: TenantRole;
};

/**
 * Signed JWT payload — multi-facility aware.
 * @see UserSessionPayload in product docs (same shape).
 */
export type SessionPayload = {
  userId: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
  /** Current facility workspace scope */
  activeFacilityId: string | null;
  /** Role at the active facility */
  activeRole: TenantRole | null;
  /** All sites this user has membership roles for */
  availableFacilities: FacilityMembership[];
  /**
   * Mirrors User.sessionVersion at sign-in time. Server-side guards reject
   * tokens whose version is stale, force-logging-out all devices after a
   * password change/reset or membership removal.
   */
  sessionVersion: number;
};

export const SESSION_COOKIE = "afyasmart_session";

export function getActiveFacilityName(session: SessionPayload): string | null {
  if (session.isPlatformAdmin) return null;
  const match = session.availableFacilities.find(
    (f) => f.facilityId === session.activeFacilityId,
  );
  return match?.facilityName ?? null;
}
