import type { TenantRole } from "@/generated/prisma/client";

export type SessionPayload = {
  userId: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
  tenantId: string | null;
  tenantName: string | null;
  role: TenantRole | null;
};

export const SESSION_COOKIE = "afyasmart_session";
