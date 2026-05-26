import { getSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

export const DEFAULT_TENANT_ID = "default";

/**
 * Active facility for the signed-in user (from session).
 * Platform admins must use admin routes — no facility tenant on session.
 */
export async function getActiveTenantId(): Promise<string> {
  const session = await getSession();
  if (!session) {
    throw new AppError("Sign in required", "UNAUTHORIZED");
  }
  if (session.isPlatformAdmin || !session.tenantId) {
    throw new AppError("No facility context for this account", "FORBIDDEN");
  }
  return session.tenantId;
}
