"use server";

import { prisma } from "@/lib/prisma";
import { requireFacilityOwner } from "@/lib/auth/guards";
import { MAX_FACILITY_STAFF } from "@/lib/auth/permissions";
import {
  hashPassword,
  validatePasswordPolicy,
} from "@/lib/auth/password";
import type { TenantRole } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import { runAction } from "@/lib/actions/utils";
import { addTeamMemberSchema, parseInput } from "@/lib/validation";

export type TeamMemberView = {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  role: TenantRole;
  createdAt: string;
};

const STAFF_ROLES: TenantRole[] = ["DEPUTY", "DISPENSER"];

export async function listTeamMembers(): Promise<
  ActionResult<{ members: TeamMemberView[]; slotsRemaining: number }>
> {
  const session = await requireFacilityOwner();
  return runAction(
    "listTeamMembers",
    async () => {
      const memberships = await prisma.membership.findMany({
        where: {
          tenantId: session.activeFacilityId!,
          role: { in: STAFF_ROLES },
        },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      });

      const members: TeamMemberView[] = memberships.map((m) => ({
        membershipId: m.id,
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
      }));

      return {
        members,
        slotsRemaining: Math.max(0, MAX_FACILITY_STAFF - members.length),
      };
    },
    { tenantId: session.activeFacilityId! },
  );
}

export async function addTeamMember(input: {
  email: string;
  name?: string;
  role: "DEPUTY" | "DISPENSER";
  password: string;
}): Promise<ActionResult<{ membershipId: string; existingUser: boolean }>> {
  const session = await requireFacilityOwner();
  return runAction(
    "addTeamMember",
    async () => {
      const parsed = parseInput(addTeamMemberSchema, input);
      const { email, role } = parsed;

      const passwordError = validatePasswordPolicy(parsed.password);
      if (passwordError) {
        throw new AppError(passwordError, "VALIDATION");
      }

      const staffCount = await prisma.membership.count({
        where: {
          tenantId: session.activeFacilityId!,
          role: { in: STAFF_ROLES },
        },
      });

      if (staffCount >= MAX_FACILITY_STAFF) {
        throw new AppError(
          `Maximum ${MAX_FACILITY_STAFF} staff accounts (deputy + dispensers)`,
          "VALIDATION",
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        // SECURITY: never overwrite an existing user's password or name —
        // an owner at another facility must not be able to hijack the account.
        const existingUser = await tx.user.findUnique({ where: { email } });

        const user =
          existingUser ??
          (await tx.user.create({
            data: {
              email,
              name: parsed.name || null,
              passwordHash: await hashPassword(parsed.password),
              isPlatformAdmin: false,
            },
          }));

        if (user.isPlatformAdmin) {
          throw new AppError("Cannot add platform admin as staff", "VALIDATION");
        }

        const existing = await tx.membership.findUnique({
          where: {
            tenantId_userId: {
              tenantId: session.activeFacilityId!,
              userId: user.id,
            },
          },
        });

        if (existing) {
          if (existing.role === "OWNER") {
            throw new AppError("User is the facility owner", "VALIDATION");
          }
          throw new AppError("User is already on this team", "VALIDATION");
        }

        const membership = await tx.membership.create({
          data: {
            tenantId: session.activeFacilityId!,
            userId: user.id,
            role,
          },
        });

        return { membership, existingUser: existingUser !== null };
      });

      return {
        membershipId: result.membership.id,
        existingUser: result.existingUser,
      };
    },
    { tenantId: session.activeFacilityId! },
  );
}

export async function updateTeamMemberRole(input: {
  membershipId: string;
  role: "DEPUTY" | "DISPENSER";
}): Promise<ActionResult<{ ok: true }>> {
  const session = await requireFacilityOwner();
  return runAction(
    "updateTeamMemberRole",
    async () => {
      const membership = await prisma.membership.findFirst({
        where: {
          id: input.membershipId,
          tenantId: session.activeFacilityId!,
          role: { in: STAFF_ROLES },
        },
      });

      if (!membership) {
        throw new AppError("Team member not found", "NOT_FOUND");
      }

      await prisma.membership.update({
        where: { id: membership.id },
        data: { role: input.role },
      });

      return { ok: true };
    },
    { tenantId: session.activeFacilityId! },
  );
}

export async function removeTeamMember(
  membershipId: string,
): Promise<ActionResult<{ ok: true }>> {
  const session = await requireFacilityOwner();
  return runAction(
    "removeTeamMember",
    async () => {
      const membership = await prisma.membership.findFirst({
        where: {
          id: membershipId,
          tenantId: session.activeFacilityId!,
          role: { in: STAFF_ROLES },
        },
      });

      if (!membership) {
        throw new AppError("Team member not found", "NOT_FOUND");
      }

      await prisma.$transaction([
        prisma.membership.delete({ where: { id: membership.id } }),
        // Invalidate the removed member's sessions so a departed employee
        // loses access immediately instead of when their JWT expires.
        prisma.user.update({
          where: { id: membership.userId },
          data: { sessionVersion: { increment: 1 } },
        }),
      ]);
      return { ok: true };
    },
    { tenantId: session.activeFacilityId! },
  );
}

export async function resetTeamMemberPassword(input: {
  membershipId: string;
  newPassword: string;
}): Promise<ActionResult<{ ok: true }>> {
  const session = await requireFacilityOwner();
  return runAction(
    "resetTeamMemberPassword",
    async () => {
      const passwordError = validatePasswordPolicy(input.newPassword);
      if (passwordError) {
        throw new AppError(passwordError, "VALIDATION");
      }

      const membership = await prisma.membership.findFirst({
        where: {
          id: input.membershipId,
          tenantId: session.activeFacilityId!,
          role: { in: STAFF_ROLES },
        },
        include: { user: true },
      });

      if (!membership) {
        throw new AppError("Team member not found", "NOT_FOUND");
      }

      await prisma.user.update({
        where: { id: membership.user.id },
        data: {
          passwordHash: await hashPassword(input.newPassword),
          sessionVersion: { increment: 1 },
        },
      });

      return { ok: true };
    },
    { tenantId: session.activeFacilityId! },
  );
}
