import { SignJWT, jwtVerify } from "jose";
import type { TenantRole } from "@/generated/prisma/client";
import type {
  FacilityMembership,
  SessionPayload,
} from "@/lib/auth/session-types";

// 24h TTL (audit H1): limits the window a stolen/stale token stays valid.
const SESSION_MAX_AGE_SEC = 60 * 60 * 24;

const VALID_ROLES = new Set<TenantRole>(["OWNER", "DEPUTY", "DISPENSER"]);

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET must be set (min 16 characters) in .env / .env.local",
    );
  }
  return new TextEncoder().encode(secret);
}

function parseRole(value: unknown): TenantRole | null {
  if (typeof value === "string" && VALID_ROLES.has(value as TenantRole)) {
    return value as TenantRole;
  }
  return null;
}

function parseMemberships(raw: unknown): FacilityMembership[] {
  if (!Array.isArray(raw)) return [];
  const list: FacilityMembership[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const facilityId = String(row.facilityId ?? "");
    const facilityName = String(row.facilityName ?? "");
    const role = parseRole(row.role);
    if (!facilityId || !facilityName || !role) continue;
    list.push({ facilityId, facilityName, role });
  }
  return list;
}

/** Normalize legacy tokens (tenantId / role) into multi-facility shape. */
function normalizePayload(raw: Record<string, unknown>): SessionPayload | null {
  if (typeof raw.userId !== "string") return null;

  let availableFacilities = parseMemberships(raw.availableFacilities);
  let activeFacilityId =
    typeof raw.activeFacilityId === "string" ? raw.activeFacilityId : null;
  let activeRole = parseRole(raw.activeRole);

  if (availableFacilities.length === 0) {
    const legacyTenantId =
      typeof raw.tenantId === "string" ? raw.tenantId : null;
    const legacyTenantName =
      typeof raw.tenantName === "string" ? raw.tenantName : "";
    const legacyRole = parseRole(raw.role);
    if (legacyTenantId && legacyRole) {
      availableFacilities = [
        {
          facilityId: legacyTenantId,
          facilityName: legacyTenantName || "Facility",
          role: legacyRole,
        },
      ];
      activeFacilityId = legacyTenantId;
      activeRole = legacyRole;
    }
  }

  if (activeFacilityId && !activeRole) {
    const match = availableFacilities.find(
      (f) => f.facilityId === activeFacilityId,
    );
    activeRole = match?.role ?? null;
  }

  return {
    userId: raw.userId,
    email: String(raw.email ?? ""),
    name: raw.name ? String(raw.name) : null,
    isPlatformAdmin: Boolean(raw.isPlatformAdmin),
    activeFacilityId,
    activeRole,
    availableFacilities,
    sessionVersion:
      typeof raw.sessionVersion === "number" ? raw.sessionVersion : 0,
  };
}

export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return normalizePayload(payload as Record<string, unknown>);
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_SEC;
