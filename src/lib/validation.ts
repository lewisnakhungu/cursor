import { z } from "zod";
import { AppError } from "@/lib/errors";
import { STOCK_UNIT_VALUES } from "@/lib/stock-unit";

/** Parse or throw an AppError carrying the first human-readable issue. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new AppError(`${path}${issue?.message ?? "Invalid input"}`, "VALIDATION");
  }
  return result.data;
}

const id = z.string().min(1).max(64);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required").max(200),
});

export const cartDispenseSchema = z
  .array(
    z.object({
      medicineId: id,
      stockBatchId: id.optional(),
      quantity: z
        .number()
        .int("Quantity must be a whole number")
        .positive("Quantity must be greater than zero")
        .max(100_000, "Quantity is unrealistically large"),
    }),
  )
  .min(1, "Cart is empty")
  .max(100, "Too many items in one sale");

export const correctSaleLineSchema = z.object({
  saleLineId: id,
  newQuantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(0, "Quantity cannot be negative")
    .max(100_000),
  reason: z
    .string()
    .trim()
    .min(3, "Correction reason is required (audit trail)")
    .max(500),
});

export const receiveInventorySchema = z.object({
  medicineId: id,
  batchNumber: z.string().trim().max(100).optional(),
  supplierName: z.string().trim().max(200).optional(),
  quantityOnHand: z
    .number()
    .int("Quantity must be a whole number")
    .positive("Quantity must be greater than zero")
    .max(1_000_000),
  expiryDate: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid expiry date"),
  stockUnit: z.enum(STOCK_UNIT_VALUES),
  unitsPerPack: z
    .number()
    .int("Pack size must be a whole number")
    .min(2, "Pack size must be 2 or more (e.g. 100 tablets per box)")
    .max(100_000)
    .optional(),
  supplierCost: z.number().min(0, "Supplier cost cannot be negative").optional(),
  retailSalePrice: z
    .number()
    .min(0, "Retail price cannot be negative")
    .optional(),
  procurementOrderId: id.optional(),
  procurementLineId: id.optional(),
});

export const addTeamMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  name: z.string().trim().max(120).optional(),
  role: z.enum(["DEPUTY", "DISPENSER"]),
  password: z.string().max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(200),
  newPassword: z.string().max(200),
});

export const bulkReceiveInventorySchema = z
  .array(receiveInventorySchema)
  .min(1, "At least one line is required")
  .max(100, "Maximum 100 lines per bulk import");
