"use server";

import { prisma } from "@/lib/prisma";
import {
  buildSessionForUser,
  clearSessionCookie,
  setSessionCookie,
} from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import { runAction } from "@/lib/actions/utils";

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

export async function getCurrentUser(): Promise<
  ActionResult<{
    email: string;
    name: string | null;
    isPlatformAdmin: boolean;
    tenantName: string | null;
    role: string | null;
  } | null>
> {
  return runAction("getCurrentUser", async () => {
    const { getSession } = await import("@/lib/auth/session");
    const session = await getSession();
    if (!session) return null;
    return {
      email: session.email,
      name: session.name,
      isPlatformAdmin: session.isPlatformAdmin,
      tenantName: session.tenantName,
      role: session.role,
    };
  });
}
