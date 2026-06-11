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

export type FacilityListItem = {
  id: string;
  name: string;
  slug: string;
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

        const owner = await tx.user.upsert({
          where: { email: ownerEmail },
          create: {
            email: ownerEmail,
            name: input.ownerName?.trim() || null,
            passwordHash,
            isPlatformAdmin: false,
          },
          update: {
            name: input.ownerName?.trim() || undefined,
            passwordHash,
            isPlatformAdmin: false,
          },
        });

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
        },
      });

      return { ok: true };
    },
    { tenantId: session.userId },
  );
}
