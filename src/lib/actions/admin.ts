"use server";

import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import {
  hashPassword,
  validatePasswordPolicy,
} from "@/lib/auth/password";
import { decimalToNumber } from "@/lib/money";
import { AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import { runAction } from "@/lib/actions/utils";
import { provisionTenantSchema } from "@/lib/tenant-schema-provision";
import { tenantSchemaName } from "@/lib/tenant-schema";

export type FacilityListItem = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  suspendedReason: string | null;
  suspendedAt: string | null;
  offlineModeAllowed: boolean;
  reportsEnabled: boolean;
  procurementEnabled: boolean;
  maxStaffAccounts: number;
  createdAt: string;
  ownerEmail: string | null;
  ownerName: string | null;
  batchCount: number;
  saleCount: number;
  unitsSold30d: number;
  revenue30d: number;
};

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

export async function listFacilities(): Promise<
  ActionResult<FacilityListItem[]>
> {
  const session = await requirePlatformAdmin();
  return runAction(
    "listFacilities",
    async () => {
      const since = daysAgo(30);
      const tenants = await prisma.tenant.findMany({
        orderBy: { name: "asc" },
        include: {
          memberships: {
            where: { role: "OWNER" },
            include: { user: { select: { email: true, name: true } } },
            take: 1,
          },
          _count: { select: { batches: true, sales: true } },
        },
      });

      const usageByTenant = await prisma.saleLine.groupBy({
        by: ["tenantId"],
        where: {
          status: "ACTIVE",
          createdAt: { gte: since },
        },
        _sum: { quantity: true, lineTotal: true },
      });

      const usageMap = new Map(
        usageByTenant.map((row) => [
          row.tenantId,
          {
            units: row._sum.quantity ?? 0,
            revenue: decimalToNumber(row._sum.lineTotal ?? 0),
          },
        ]),
      );

      return tenants.map((tenant) => {
        const owner = tenant.memberships[0]?.user;
        const usage = usageMap.get(tenant.id);
        return {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          suspendedReason: tenant.suspendedReason,
          suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
          offlineModeAllowed: tenant.offlineModeAllowed,
          reportsEnabled: tenant.reportsEnabled,
          procurementEnabled: tenant.procurementEnabled,
          maxStaffAccounts: tenant.maxStaffAccounts,
          createdAt: tenant.createdAt.toISOString(),
          ownerEmail: owner?.email ?? null,
          ownerName: owner?.name ?? null,
          batchCount: tenant._count.batches,
          saleCount: tenant._count.sales,
          unitsSold30d: usage?.units ?? 0,
          revenue30d: Math.round((usage?.revenue ?? 0) * 100) / 100,
        };
      });
    },
    { tenantId: session.userId },
  );
}

export async function createFacility(input: {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName?: string;
  ownerPassword: string;
}): Promise<ActionResult<{ tenantId: string }>> {
  const session = await requirePlatformAdmin();
  return runAction(
    "createFacility",
    async () => {
      const name = input.name.trim();
      const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const ownerEmail = input.ownerEmail.trim().toLowerCase();

      if (!name || !slug || !ownerEmail) {
        throw new AppError("Name, slug, and owner email are required", "VALIDATION");
      }

      const passwordError = validatePasswordPolicy(input.ownerPassword);
      if (passwordError) {
        throw new AppError(passwordError, "VALIDATION");
      }

      const existingSlug = await prisma.tenant.findUnique({ where: { slug } });
      if (existingSlug) {
        throw new AppError("Facility slug already exists", "VALIDATION");
      }

      const passwordHash = await hashPassword(input.ownerPassword);

      const tenant = await prisma.$transaction(async (tx) => {
        const facility = await tx.tenant.create({
          data: { name, slug },
        });

        // SECURITY (same class as H6): never overwrite an existing user's
        // password when attaching them as owner of a new facility.
        const existingOwner = await tx.user.findUnique({
          where: { email: ownerEmail },
        });
        const owner =
          existingOwner ??
          (await tx.user.create({
            data: {
              email: ownerEmail,
              name: input.ownerName?.trim() || null,
              passwordHash,
              isPlatformAdmin: false,
              mustChangePassword: true,
            },
          }));

        if (owner.isPlatformAdmin) {
          throw new AppError(
            "Cannot assign a platform admin as facility owner",
            "VALIDATION",
          );
        }

        await tx.membership.upsert({
          where: {
            tenantId_userId: { tenantId: facility.id, userId: owner.id },
          },
          create: {
            tenantId: facility.id,
            userId: owner.id,
            role: "OWNER",
          },
          update: { role: "OWNER" },
        });

        return facility;
      });

      // Provision isolated PostgreSQL schema for the new facility
      await provisionTenantSchema(tenant.id);

      return { tenantId: tenant.id };
    },
    { tenantId: session.userId },
  );
}

export async function resetFacilityOwnerPassword(input: {
  tenantId: string;
  newPassword: string;
}): Promise<ActionResult<{ ok: true }>> {
  const session = await requirePlatformAdmin();
  return runAction(
    "resetFacilityOwnerPassword",
    async () => {
      const passwordError = validatePasswordPolicy(input.newPassword);
      if (passwordError) {
        throw new AppError(passwordError, "VALIDATION");
      }

      const membership = await prisma.membership.findFirst({
        where: { tenantId: input.tenantId, role: "OWNER" },
        include: { user: true },
      });

      if (!membership?.user) {
        throw new AppError("Facility owner not found", "NOT_FOUND");
      }

      if (membership.user.isPlatformAdmin) {
        throw new AppError("Cannot reset platform admin via this action", "FORBIDDEN");
      }

      await prisma.user.update({
        where: { id: membership.user.id },
        data: {
          passwordHash: await hashPassword(input.newPassword),
          sessionVersion: { increment: 1 },
          mustChangePassword: true,
        },
      });

      return { ok: true };
    },
    { tenantId: session.userId },
  );
}

export async function suspendFacility(input: {
  tenantId: string;
  reason?: string;
}): Promise<ActionResult<{ ok: true }>> {
  const session = await requirePlatformAdmin();
  return runAction(
    "suspendFacility",
    async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { id: true, name: true, status: true },
      });
      if (!tenant) throw new AppError("Facility not found", "NOT_FOUND");
      if (tenant.status === "SUSPENDED") {
        throw new AppError("Facility is already suspended", "VALIDATION");
      }

      await prisma.$transaction(async (tx) => {
        await tx.tenant.update({
          where: { id: input.tenantId },
          data: {
            status: "SUSPENDED",
            suspendedReason: input.reason?.trim() || "Suspended by administrator",
            suspendedAt: new Date(),
          },
        });

        // Invalidate all active sessions for staff of this facility
        const memberships = await tx.membership.findMany({
          where: { tenantId: input.tenantId },
          select: { userId: true },
        });
        if (memberships.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: memberships.map((m) => m.userId) } },
            data: { sessionVersion: { increment: 1 } },
          });
        }
      });

      return { ok: true as const };
    },
    { tenantId: session.userId },
  );
}

export async function unsuspendFacility(input: {
  tenantId: string;
}): Promise<ActionResult<{ ok: true }>> {
  const session = await requirePlatformAdmin();
  return runAction(
    "unsuspendFacility",
    async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { id: true, status: true },
      });
      if (!tenant) throw new AppError("Facility not found", "NOT_FOUND");

      await prisma.tenant.update({
        where: { id: input.tenantId },
        data: {
          status: "ACTIVE",
          suspendedReason: null,
          suspendedAt: null,
        },
      });

      return { ok: true as const };
    },
    { tenantId: session.userId },
  );
}

export async function deleteFacility(input: {
  tenantId: string;
  force?: boolean;
}): Promise<ActionResult<{ ok: true; action: "SOFT_DELETED" | "PURGED" }>> {
  const session = await requirePlatformAdmin();
  return runAction(
    "deleteFacility",
    async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: input.tenantId },
        include: {
          _count: { select: { batches: true, sales: true } },
        },
      });
      if (!tenant) throw new AppError("Facility not found", "NOT_FOUND");

      const hasData = tenant._count.batches > 0 || tenant._count.sales > 0;

      // Soft-delete if facility has operational data and force is false (healthcare compliance preservation)
      if (hasData && !input.force) {
        await prisma.$transaction(async (tx) => {
          await tx.tenant.update({
            where: { id: input.tenantId },
            data: {
              status: "DELETED",
              slug: `deleted_${Date.now()}_${tenant.slug}`,
              suspendedReason: "Account deleted / archived",
              suspendedAt: new Date(),
            },
          });

          // Invalidate user sessions
          const memberships = await tx.membership.findMany({
            where: { tenantId: input.tenantId },
            select: { userId: true },
          });
          if (memberships.length > 0) {
            await tx.user.updateMany({
              where: { id: { in: memberships.map((m) => m.userId) } },
              data: { sessionVersion: { increment: 1 } },
            });
          }
        });

        return { ok: true as const, action: "SOFT_DELETED" };
      }

      // Hard purge if empty or explicitly forced
      const schema = tenantSchemaName(input.tenantId);
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema.replace(/"/g, '""')}" CASCADE`);
        await tx.$executeRaw`DELETE FROM public.tenant_schema_registry WHERE tenant_id = ${input.tenantId}`.catch(() => {});
        await tx.tenant.delete({ where: { id: input.tenantId } });
      });

      return { ok: true as const, action: "PURGED" };
    },
    { tenantId: session.userId },
  );
}

export async function updateFacilityFeatures(input: {
  tenantId: string;
  offlineModeAllowed?: boolean;
  reportsEnabled?: boolean;
  procurementEnabled?: boolean;
  maxStaffAccounts?: number;
}): Promise<ActionResult<{ ok: true }>> {
  const session = await requirePlatformAdmin();
  return runAction(
    "updateFacilityFeatures",
    async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { id: true },
      });
      if (!tenant) throw new AppError("Facility not found", "NOT_FOUND");

      await prisma.tenant.update({
        where: { id: input.tenantId },
        data: {
          ...(input.offlineModeAllowed !== undefined ? { offlineModeAllowed: input.offlineModeAllowed } : {}),
          ...(input.reportsEnabled !== undefined ? { reportsEnabled: input.reportsEnabled } : {}),
          ...(input.procurementEnabled !== undefined ? { procurementEnabled: input.procurementEnabled } : {}),
          ...(input.maxStaffAccounts !== undefined ? { maxStaffAccounts: Math.max(1, input.maxStaffAccounts) } : {}),
        },
      });

      return { ok: true as const };
    },
    { tenantId: session.userId },
  );
}
