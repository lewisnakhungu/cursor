import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  cartDispenseSchema,
  correctSaleLineSchema,
  loginSchema,
  parseInput,
  receiveInventorySchema,
} from "@/lib/validation";

describe("parseInput", () => {
  it("returns parsed data on success", () => {
    const data = parseInput(loginSchema, {
      email: "  USER@Test.COM ",
      password: "x",
    });
    expect(data.email).toBe("user@test.com");
  });

  it("throws AppError with VALIDATION code on failure", () => {
    try {
      parseInput(loginSchema, { email: "not-an-email", password: "x" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("VALIDATION");
    }
  });
});

describe("cartDispenseSchema", () => {
  it("rejects empty carts", () => {
    expect(cartDispenseSchema.safeParse([]).success).toBe(false);
  });

  it("rejects zero, negative, and fractional quantities", () => {
    for (const quantity of [0, -1, 1.5]) {
      const result = cartDispenseSchema.safeParse([
        { medicineId: "m1", quantity },
      ]);
      expect(result.success).toBe(false);
    }
  });

  it("accepts a valid cart with optional batch pinning", () => {
    const result = cartDispenseSchema.safeParse([
      { medicineId: "m1", quantity: 2 },
      { medicineId: "m2", stockBatchId: "b9", quantity: 10 },
    ]);
    expect(result.success).toBe(true);
  });
});

describe("correctSaleLineSchema", () => {
  it("requires a meaningful reason", () => {
    const result = correctSaleLineSchema.safeParse({
      saleLineId: "sl1",
      newQuantity: 1,
      reason: "  x ",
    });
    expect(result.success).toBe(false);
  });

  it("allows zero quantity (void) but not negative", () => {
    expect(
      correctSaleLineSchema.safeParse({
        saleLineId: "sl1",
        newQuantity: 0,
        reason: "customer returned",
      }).success,
    ).toBe(true);
    expect(
      correctSaleLineSchema.safeParse({
        saleLineId: "sl1",
        newQuantity: -1,
        reason: "customer returned",
      }).success,
    ).toBe(false);
  });
});

describe("receiveInventorySchema", () => {
  const valid = {
    medicineId: "m1",
    quantityOnHand: 100,
    expiryDate: "2027-06-01",
    stockUnit: "TABLET",
  };

  it("accepts a minimal valid batch", () => {
    expect(receiveInventorySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid expiry dates", () => {
    expect(
      receiveInventorySchema.safeParse({ ...valid, expiryDate: "not-a-date" })
        .success,
    ).toBe(false);
  });

  it("rejects unknown stock units", () => {
    expect(
      receiveInventorySchema.safeParse({ ...valid, stockUnit: "PACKET" })
        .success,
    ).toBe(false);
  });

  it("rejects pack size below 2 and negative prices", () => {
    expect(
      receiveInventorySchema.safeParse({ ...valid, unitsPerPack: 1 }).success,
    ).toBe(false);
    expect(
      receiveInventorySchema.safeParse({ ...valid, retailSalePrice: -5 })
        .success,
    ).toBe(false);
  });
});
