"use server";

import { requireTenantContext } from "@/lib/auth/guards";
import { AppError } from "@/lib/errors";
import { runAction } from "@/lib/actions/utils";
import { parseInput } from "@/lib/validation";
import {
  supplierIdSchema,
  supplierSchema,
} from "@/lib/validation-procurement";
import type { ActionResult, SupplierView } from "@/lib/types";

export async function listSuppliers(): Promise<ActionResult<SupplierView[]>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "listSuppliers",
    async () => {
      const suppliers = await ctx.db.supplier.findMany({
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      });
      return suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        contact: s.contact,
        notes: s.notes,
        isDefault: s.isDefault,
      }));
    },
    { tenantId: ctx.tenantId },
  );
}

export async function createSupplier(
  input: {
    name: string;
    contact?: string | null;
    notes?: string | null;
    isDefault?: boolean;
  },
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "createSupplier",
    async () => {
      const data = parseInput(supplierSchema, input);

      if (data.isDefault) {
        await ctx.db.supplier.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      const supplier = await ctx.db.supplier.create({
        data: {
          tenantId: ctx.tenantId,
          name: data.name,
          contact: data.contact ?? null,
          notes: data.notes ?? null,
          isDefault: data.isDefault ?? false,
        },
        select: { id: true },
      });

      return { id: supplier.id };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function updateSupplier(
  input: {
    supplierId: string;
    name: string;
    contact?: string | null;
    notes?: string | null;
    isDefault?: boolean;
  },
): Promise<ActionResult<{ ok: true }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "updateSupplier",
    async () => {
      const { supplierId } = parseInput(supplierIdSchema, {
        supplierId: input.supplierId,
      });
      const data = parseInput(supplierSchema, input);

      const existing = await ctx.db.supplier.findUnique({
        where: { id: supplierId },
      });
      if (!existing) {
        throw new AppError("Supplier not found", "NOT_FOUND");
      }

      if (data.isDefault) {
        await ctx.db.supplier.updateMany({
          where: { isDefault: true, id: { not: supplierId } },
          data: { isDefault: false },
        });
      }

      await ctx.db.supplier.update({
        where: { id: supplierId },
        data: {
          name: data.name,
          contact: data.contact ?? null,
          notes: data.notes ?? null,
          isDefault: data.isDefault,
        },
      });

      return { ok: true as const };
    },
    { tenantId: ctx.tenantId },
  );
}

export async function deleteSupplier(
  supplierId: string,
): Promise<ActionResult<{ ok: true }>> {
  const ctx = await requireTenantContext("procurement.manage");
  return runAction(
    "deleteSupplier",
    async () => {
      const data = parseInput(supplierIdSchema, { supplierId });
      const existing = await ctx.db.supplier.findUnique({
        where: { id: data.supplierId },
      });
      if (!existing) {
        throw new AppError("Supplier not found", "NOT_FOUND");
      }
      await ctx.db.supplier.delete({ where: { id: data.supplierId } });
      return { ok: true as const };
    },
    { tenantId: ctx.tenantId },
  );
}
