/**
 * Resolves the active facility (tenant) for the current request.
 * Production: replace with session/JWT → Membership lookup.
 */
export const DEFAULT_TENANT_ID = "default";

export async function getActiveTenantId(): Promise<string> {
  const fromEnv = process.env.TENANT_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_TENANT_ID;
}
