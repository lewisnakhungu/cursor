"use server";

import { prisma } from "@/lib/prisma";
import {
  buildSessionForUser,
  clearSessionCookie,
  getSession,
  setSessionCookie,
} from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import { runAction } from "@/lib/actions/utils";
import { requireSession } from "@/lib/auth/session";
import { getActiveFacilityName } from "@/lib/auth/session-types";

export async function login(
  email: string,
  password: string,
): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction("login", async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) {
      throw new AppError("Email and password are required", "VALIDATION");
    }

    const user = await prisma.user.findUnique({
      where: { email: normalized },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
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

    const redirectTo = session.isPlatformAdmin ? "/admin" : "/";
    return { redirectTo };
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
        return { redirectTo: "/" };
      }

      const updated = {
        ...session,
        activeFacilityId: match.facilityId,
        activeRole: match.role,
      };

      await setSessionCookie(updated);

      return { redirectTo: "/" };
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
