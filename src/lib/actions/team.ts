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
          tenantId: session.tenantId!,
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
    { tenantId: session.tenantId! },
  );
}

export async function addTeamMember(input: {
  email: string;
  name?: string;
  role: "DEPUTY" | "DISPENSER";
  password: string;
}): Promise<ActionResult<{ membershipId: string }>> {
  const session = await requireFacilityOwner();
  return runAction(
    "addTeamMember",
    async () => {
      const email = input.email.trim().toLowerCase();
      if (!email) {
        throw new AppError("Email is required", "VALIDATION");
      }
      if (!STAFF_ROLES.includes(input.role)) {
        throw new AppError("Invalid role", "VALIDATION");
      }

      const passwordError = validatePasswordPolicy(input.password);
      if (passwordError) {
        throw new AppError(passwordError, "VALIDATION");
      }

      const staffCount = await prisma.membership.count({
        where: {
          tenantId: session.tenantId!,
          role: { in: STAFF_ROLES },
        },
      });

      if (staffCount >= MAX_FACILITY_STAFF) {
        throw new AppError(
          `Maximum ${MAX_FACILITY_STAFF} staff accounts (deputy + dispensers)`,
          "VALIDATION",
        );
      }

      const passwordHash = await hashPassword(input.password);

      const membership = await prisma.$transaction(async (tx) => {
        const user = await tx.user.upsert({
          where: { email },
          create: {
            email,
            name: input.name?.trim() || null,
            passwordHash,
            isPlatformAdmin: false,
          },
          update: {
            name: input.name?.trim() || undefined,
            passwordHash,
          },
        });

        if (user.isPlatformAdmin) {
          throw new AppError("Cannot add platform admin as staff", "VALIDATION");
        }

        const existing = await tx.membership.findUnique({
          where: {
            tenantId_userId: {
              tenantId: session.tenantId!,
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

        const otherFacility = await tx.membership.findFirst({
          where: { userId: user.id },
        });
        if (otherFacility && otherFacility.tenantId !== session.tenantId) {
          throw new AppError(
            "User already belongs to another facility",
            "VALIDATION",
          );
        }

        return tx.membership.create({
          data: {
            tenantId: session.tenantId!,
            userId: user.id,
            role: input.role,
          },
        });
      });

      return { membershipId: membership.id };
    },
    { tenantId: session.tenantId! },
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
          tenantId: session.tenantId!,
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
    { tenantId: session.tenantId! },
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
          tenantId: session.tenantId!,
          role: { in: STAFF_ROLES },
        },
      });

      if (!membership) {
        throw new AppError("Team member not found", "NOT_FOUND");
      }

      await prisma.membership.delete({ where: { id: membership.id } });
      return { ok: true };
    },
    { tenantId: session.tenantId! },
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
          tenantId: session.tenantId!,
          role: { in: STAFF_ROLES },
        },
        include: { user: true },
      });

      if (!membership) {
        throw new AppError("Team member not found", "NOT_FOUND");
      }

      await prisma.user.update({
        where: { id: membership.user.id },
        data: { passwordHash: await hashPassword(input.newPassword) },
      });

      return { ok: true };
    },
    { tenantId: session.tenantId! },
  );
}
