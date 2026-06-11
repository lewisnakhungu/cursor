import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  createSessionToken,
  verifySessionToken,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/jwt";
import {
  SESSION_COOKIE,
  type FacilityMembership,
  type SessionPayload,
} from "@/lib/auth/session-types";

export { verifySessionToken } from "@/lib/auth/jwt";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

function sortMemberships(
  memberships: FacilityMembership[],
): FacilityMembership[] {
  return [...memberships].sort((a, b) =>
    a.facilityName.localeCompare(b.facilityName),
  );
}

export async function buildSessionForUser(
  userId: string,
  preferredActiveFacilityId?: string,
): Promise<SessionPayload | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: { tenant: { name: "asc" } },
      },
    },
  });

  if (!user?.passwordHash) return null;

  if (user.isPlatformAdmin) {
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: true,
      activeFacilityId: null,
      activeRole: null,
      availableFacilities: [],
      sessionVersion: user.sessionVersion,
    };
  }

  const availableFacilities = sortMemberships(
    user.memberships.map((m) => ({
      facilityId: m.tenant.id,
      facilityName: m.tenant.name,
      role: m.role,
    })),
  );

  if (availableFacilities.length === 0) return null;

  const active =
    availableFacilities.find(
      (f) => f.facilityId === preferredActiveFacilityId,
    ) ?? availableFacilities[0];

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    isPlatformAdmin: false,
    activeFacilityId: active.facilityId,
    activeRole: active.role,
    availableFacilities,
    sessionVersion: user.sessionVersion,
  };
}

/**
 * Server-side revocation check (audit H1): a JWT is only honored while its
 * sessionVersion matches the DB. Password changes/resets and membership
 * removals bump the version, force-logging-out every device immediately
 * (the edge middleware still does the cheap signature/expiry check only).
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new AppError("Sign in required", "UNAUTHORIZED");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { sessionVersion: true },
  });

  if (!user || user.sessionVersion !== session.sessionVersion) {
    throw new AppError(
      "Your session is no longer valid. Please sign in again.",
      "UNAUTHORIZED",
    );
  }

  return session;
}
