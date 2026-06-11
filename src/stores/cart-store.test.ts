import { beforeEach, describe, expect, it } from "vitest";
import { useCartStore, type CartLine } from "@/stores/cart-store";

function baseLine(
  overrides: Partial<Omit<CartLine, "id" | "lineTotal">> = {},
): Omit<CartLine, "id" | "lineTotal"> {
  return {
    medicineId: "med-1",
    stockBatchId: "batch-1",
    genericName: "Paracetamol",
    dosageForm: "Tablet",
    strength: "500mg",
    batchNumber: "LOT-1",
    expiryDate: "2027-01-01",
    stockUnit: "TABLET",
    unitsPerPack: null,
    quantity: 4,
    maxQuantity: 100,
    unitPrice: 2,
    ...overrides,
  };
}

beforeEach(() => {
  useCartStore.getState().clear();
});

describe("cart store", () => {
  it("adds a line with computed total", () => {
    useCartStore.getState().addLine(baseLine());
    const { lines } = useCartStore.getState();
    expect(lines).toHaveLength(1);
    expect(lines[0].lineTotal).toBe(8);
  });

  it("clamps quantity to maxQuantity on add", () => {
    useCartStore.getState().addLine(baseLine({ quantity: 500, maxQuantity: 10 }));
    expect(useCartStore.getState().lines[0].quantity).toBe(10);
  });

  it("merges duplicate batch adds instead of duplicating lines", () => {
    useCartStore.getState().addLine(baseLine({ quantity: 4 }));
    useCartStore.getState().addLine(baseLine({ quantity: 3 }));
    const { lines } = useCartStore.getState();
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(7);
    expect(lines[0].lineTotal).toBe(14);
  });

  it("caps merged quantity at maxQuantity", () => {
    useCartStore.getState().addLine(baseLine({ quantity: 80, maxQuantity: 100 }));
    useCartStore.getState().addLine(baseLine({ quantity: 80, maxQuantity: 100 }));
    expect(useCartStore.getState().lines[0].quantity).toBe(100);
  });

  it("updateQuantity clamps between 1 and max", () => {
    useCartStore.getState().addLine(baseLine());
    const id = useCartStore.getState().lines[0].id;

    useCartStore.getState().updateQuantity(id, 0);
    expect(useCartStore.getState().lines[0].quantity).toBe(1);

    useCartStore.getState().updateQuantity(id, 9999);
    expect(useCartStore.getState().lines[0].quantity).toBe(100);
  });

  it("normalizes unknown stock units to UNIT", () => {
    useCartStore
      .getState()
      .addLine(baseLine({ stockUnit: "PACKET" as CartLine["stockUnit"] }));
    expect(useCartStore.getState().lines[0].stockUnit).toBe("UNIT");
  });

  it("removeLine and clear work", () => {
    useCartStore.getState().addLine(baseLine());
    useCartStore
      .getState()
      .addLine(baseLine({ stockBatchId: "batch-2", quantity: 1 }));
    expect(useCartStore.getState().lines).toHaveLength(2);

    const id = useCartStore.getState().lines[0].id;
    useCartStore.getState().removeLine(id);
    expect(useCartStore.getState().lines).toHaveLength(1);

    useCartStore.getState().clear();
    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it("cartTotal sums line totals", () => {
    useCartStore.getState().addLine(baseLine({ quantity: 2, unitPrice: 5 }));
    useCartStore
      .getState()
      .addLine(baseLine({ stockBatchId: "batch-2", quantity: 3, unitPrice: 10 }));
    expect(useCartStore.getState().cartTotal()).toBe(40);
  });
});
