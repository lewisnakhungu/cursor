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

export async function buildSessionForUser(
  userId: string,
): Promise<SessionPayload | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { tenant: { select: { id: true, name: true } } },
        take: 1,
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
      tenantId: null,
      tenantName: null,
      role: null,
    };
  }

  const membership = user.memberships[0];
  if (!membership) return null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    isPlatformAdmin: false,
    tenantId: membership.tenant.id,
    tenantName: membership.tenant.name,
    role: membership.role,
  };
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new AppError("Sign in required", "UNAUTHORIZED");
  }
  return session;
}
