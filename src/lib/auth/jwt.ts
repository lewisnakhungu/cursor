import { SignJWT, jwtVerify } from "jose";
import type { TenantRole } from "@/generated/prisma/client";
import type { SessionPayload } from "@/lib/auth/session-types";

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET must be set (min 16 characters) in .env / .env.local",
    );
  }
  return new TextEncoder().encode(secret);
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
    if (typeof payload.userId !== "string") return null;
    return {
      userId: payload.userId,
      email: String(payload.email ?? ""),
      name: payload.name ? String(payload.name) : null,
      isPlatformAdmin: Boolean(payload.isPlatformAdmin),
      tenantId: payload.tenantId ? String(payload.tenantId) : null,
      tenantName: payload.tenantName ? String(payload.tenantName) : null,
      role: (payload.role as TenantRole | null) ?? null,
    };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_SEC;
