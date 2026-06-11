"use server";

import { prisma } from "@/lib/prisma";
import {
  buildSessionForUser,
  clearSessionCookie,
  getSession,
  setSessionCookie,
} from "@/lib/auth/session";
import {
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "@/lib/auth/password";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { changePasswordSchema, loginSchema, parseInput } from "@/lib/validation";
import { headers } from "next/headers";
import { AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import { runAction } from "@/lib/actions/utils";
import { requireSession } from "@/lib/auth/session";
import { getActiveFacilityName } from "@/lib/auth/session-types";

const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

async function loginRateKey(email: string): Promise<string> {
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    "unknown";
  return `login:${ip}:${email}`;
}

export async function login(
  email: string,
  password: string,
): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction("login", async () => {
    const { email: normalized, password: pass } = parseInput(loginSchema, {
      email,
      password,
    });

    const rateKey = await loginRateKey(normalized);
    const rate = checkRateLimit(rateKey, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS);
    if (!rate.allowed) {
      const minutes = Math.max(1, Math.ceil(rate.retryAfterMs / 60_000));
      throw new AppError(
        `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        "RATE_LIMITED",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalized },
    });

    if (!user || !(await verifyPassword(pass, user.passwordHash))) {
      throw new AppError("Invalid email or password", "UNAUTHORIZED");
    }

    const session = await buildSessionForUser(user.id);
    if (!session) {
      throw new AppError(
        "Account is not assigned to a facility. Contact your administrator.",
        "FORBIDDEN",
      );
    }

    await setSessionCookie(session);

    // Only a fully completed sign-in clears the attempt counter.
    resetRateLimit(rateKey);

    const redirectTo = session.isPlatformAdmin ? "/admin" : "/dashboard";
    return { redirectTo };
  });
}

/**
 * Self-service password change (audit P-C1). Requires the current password,
 * bumps sessionVersion to revoke every other device, then re-issues a fresh
 * session for this device so the user stays signed in.
 */
export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult<{ ok: true }>> {
  const session = await requireSession();
  return runAction("changeOwnPassword", async () => {
    const { currentPassword, newPassword } = parseInput(
      changePasswordSchema,
      input,
    );

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      throw new AppError(policyError, "VALIDATION");
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError("Current password is incorrect", "UNAUTHORIZED");
    }

    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new AppError(
        "New password must be different from the current one",
        "VALIDATION",
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        sessionVersion: { increment: 1 },
        mustChangePassword: false,
      },
    });

    const fresh = await buildSessionForUser(
      session.userId,
      session.activeFacilityId ?? undefined,
    );
    if (!fresh) {
      await clearSessionCookie();
      throw new AppError("Please sign in again", "UNAUTHORIZED");
    }
    await setSessionCookie(fresh);

    return { ok: true };
  });
}

export async function logout(): Promise<ActionResult<{ ok: true }>> {
  return runAction("logout", async () => {
    await clearSessionCookie();
    return { ok: true };
  });
}

export async function switchActiveFacility(
  targetFacilityId: string,
): Promise<ActionResult<{ redirectTo: string }>> {
  const session = await requireSession();
  return runAction(
    "switchActiveFacility",
    async () => {
      if (session.isPlatformAdmin) {
        throw new AppError(
          "Platform admins use the admin console only",
          "FORBIDDEN",
        );
      }

      const match = session.availableFacilities.find(
        (f) => f.facilityId === targetFacilityId,
      );

      if (!match) {
        throw new AppError(
          "You do not have access to that facility",
          "FORBIDDEN",
        );
      }

      if (match.facilityId === session.activeFacilityId) {
        return { redirectTo: "/dashboard" };
      }

      const updated = {
        ...session,
        activeFacilityId: match.facilityId,
        activeRole: match.role,
      };

      await setSessionCookie(updated);

      return { redirectTo: "/dashboard" };
    },
    { tenantId: targetFacilityId },
  );
}

export async function getCurrentUser(): Promise<
  ActionResult<{
    email: string;
    name: string | null;
    isPlatformAdmin: boolean;
    activeFacilityId: string | null;
    activeFacilityName: string | null;
    activeRole: string | null;
    availableFacilities: Array<{
      facilityId: string;
      facilityName: string;
      role: string;
    }>;
  } | null>
> {
  return runAction("getCurrentUser", async () => {
    const session = await getSession();
    if (!session) return null;
    return {
      email: session.email,
      name: session.name,
      isPlatformAdmin: session.isPlatformAdmin,
      activeFacilityId: session.activeFacilityId,
      activeFacilityName: getActiveFacilityName(session),
      activeRole: session.activeRole,
      availableFacilities: session.availableFacilities.map((f) => ({
        facilityId: f.facilityId,
        facilityName: f.facilityName,
        role: f.role,
      })),
    };
  });
}
