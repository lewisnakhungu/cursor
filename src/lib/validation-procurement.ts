import { z } from "zod";
import { STOCK_UNIT_VALUES } from "@/lib/stock-unit";

const id = z.string().min(1).max(64);

export const generateReorderDraftSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
  supplierName: z.string().trim().max(200).optional(),
  supplierId: id.optional(),
});

export const updateProcurementOrderSchema = z.object({
  orderId: id,
  notes: z.string().trim().max(2000).nullable().optional(),
  supplierName: z.string().trim().max(200).nullable().optional(),
  supplierId: id.nullable().optional(),
  lines: z
    .array(
      z.object({
        lineId: id,
        orderedQty: z
          .number()
          .int()
          .min(0, "Quantity cannot be negative")
          .max(1_000_000),
        priority: z.enum(["HIGH", "NORMAL"]).optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        stockUnit: z.enum(STOCK_UNIT_VALUES).optional(),
        unitsPerPack: z.number().int().min(2).max(100_000).nullable().optional(),
      }),
    )
    .optional(),
});

export const addProcurementLineSchema = z.object({
  orderId: id,
  medicineId: id,
  orderedQty: z
    .number()
    .int()
    .positive("Quantity must be greater than zero")
    .max(1_000_000),
  stockUnit: z.enum(STOCK_UNIT_VALUES),
  unitsPerPack: z.number().int().min(2).max(100_000).nullable().optional(),
  reason: z.enum(["MANUAL", "NEW_ITEM"]).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const updateProcurementLineSchema = z.object({
  lineId: id,
});

export const submitProcurementOrderSchema = z.object({
  orderId: id,
});

export const bulkImportProcurementLinesSchema = z.object({
  orderId: id,
  lines: z
    .array(
      z.object({
        medicineId: id,
        orderedQty: z
          .number()
          .int()
          .positive("Quantity must be greater than zero")
          .max(1_000_000),
        stockUnit: z.enum(STOCK_UNIT_VALUES),
        unitsPerPack: z.number().int().min(2).max(100_000).nullable().optional(),
        rawName: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, "At least one line is required")
    .max(100, "Maximum 100 lines per import"),
});

export const createProcurementDraftSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
  supplierName: z.string().trim().max(200).optional(),
  supplierId: id.optional(),
});

export const upsertReorderPolicySchema = z.object({
  medicineId: id,
  reorderPoint: z.number().int().min(0).max(1_000_000).nullable().optional(),
  targetLevel: z.number().int().min(0).max(1_000_000).nullable().optional(),
  leadTimeDays: z.number().int().min(1).max(365).optional(),
  safetyStockDays: z.number().int().min(0).max(90).optional(),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(200),
  contact: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export const supplierIdSchema = z.object({
  supplierId: id,
});
