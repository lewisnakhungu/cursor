import { getSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

export const DEFAULT_TENANT_ID = "default";

/**
 * Active facility for the signed-in user (from session.activeFacilityId).
 */
export async function getActiveTenantId(): Promise<string> {
  const session = await getSession();
  if (!session) {
    throw new AppError("Sign in required", "UNAUTHORIZED");
  }
  if (session.isPlatformAdmin || !session.activeFacilityId) {
    throw new AppError("No facility context for this account", "FORBIDDEN");
  }
  return session.activeFacilityId;
}
