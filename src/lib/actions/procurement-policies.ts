"use server";

import { requireTenantContext } from "@/lib/auth/guards";
import { AppError } from "@/lib/errors";
import { runAction } from "@/lib/actions/utils";
import { parseInput } from "@/lib/validation";
import {
  upsertReorderPolicySchema,
} from "@/lib/validation-procurement";
import { prisma } from "@/lib/prisma";
import type { ActionResult, ReorderPolicyView } from "@/lib/types";

export async function listReorderPolicies(): Promise<
  ActionResult<ReorderPolicyView[]>
> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "listReorderPolicies",
    async () => {
      const policies = await ctx.db.medicineReorderPolicy.findMany({
        include: {
          medicine: {
            select: {
              genericName: true,
              dosageForm: true,
              strength: true,
            },
          },
        },
        orderBy: { medicine: { genericName: "asc" } },
      });

      return policies.map((p) => ({
        id: p.id,
        medicineId: p.medicineId,
        genericName: p.medicine.genericName,
        dosageForm: p.medicine.dosageForm,
        strength: p.medicine.strength,
        reorderPoint: p.reorderPoint,
        targetLevel: p.targetLevel,
        leadTimeDays: p.leadTimeDays,
        safetyStockDays: p.safetyStockDays,
      }));
    },
    { tenantId: ctx.tenantId },
  );
}

export async function upsertReorderPolicy(
  input: {
    medicineId: string;
    reorderPoint?: number | null;
    targetLevel?: number | null;
    leadTimeDays?: number;
    safetyStockDays?: number;
  },
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "upsertReorderPolicy",
    async () => {
      const data = parseInput(upsertReorderPolicySchema, input);

      const medicine = await prisma.medicine.findUnique({
        where: { id: data.medicineId },
        select: { id: true },
      });
      if (!medicine) {
        throw new AppError("Medicine not found in catalog", "NOT_FOUND");
      }

      const policy = await ctx.db.medicineReorderPolicy.upsert({
        where: {
          tenantId_medicineId: {
            tenantId: ctx.tenantId,
            medicineId: data.medicineId,
          },
        },
        create: {
          medicineId: data.medicineId,
          reorderPoint: data.reorderPoint ?? null,
          targetLevel: data.targetLevel ?? null,
          leadTimeDays: data.leadTimeDays ?? 14,
          safetyStockDays: data.safetyStockDays ?? 3,
        },
        update: {
          reorderPoint: data.reorderPoint,
          targetLevel: data.targetLevel,
          leadTimeDays: data.leadTimeDays,
          safetyStockDays: data.safetyStockDays,
        },
        select: { id: true },
      });

      return { id: policy.id };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function deleteReorderPolicy(
  medicineId: string,
): Promise<ActionResult<{ ok: true }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "deleteReorderPolicy",
    async () => {
      await ctx.db.medicineReorderPolicy.deleteMany({
        where: { medicineId },
      });
      return { ok: true as const };
    },
    { tenantId: ctx.tenantId },
  );
}
