import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispenseOffline } from "./offline-dispense";
import { getOfflineBatchesForMedicine, decrementOfflineStock } from "@/lib/offline/stock-cache";
import { enqueueDispense } from "@/lib/offline/sync-queue";
import type { AfyaDB } from "@/lib/offline/db";
import type { CartLine } from "@/stores/cart-store";

vi.mock("@/lib/offline/stock-cache", () => ({
  getOfflineBatchesForMedicine: vi.fn(),
  decrementOfflineStock: vi.fn(),
}));

vi.mock("@/lib/offline/sync-queue", () => ({
  enqueueDispense: vi.fn(),
  generateLocalId: () => "LOCAL-20260611-001",
}));

describe("dispenseOffline", () => {
  const mockDb = {} as AfyaDB;
  const tenantId = "tenant-1";

  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "navigator", {
        value: {
          serviceWorker: {
            ready: Promise.resolve({
              sync: {
                register: vi.fn(),
              },
            }),
          },
        },
        writable: true,
      });
    }
  });

  it("should return error if cart is empty", async () => {
    const result = await dispenseOffline(mockDb, tenantId, []);
    expect(result).toEqual({ ok: false, error: "Cart is empty" });
  });

  it("should return error if stock is insufficient", async () => {
    const cartLines: CartLine[] = [
      {
        id: "line-1",
        medicineId: "med-1",
        stockBatchId: "batch-1",
        genericName: "Paracetamol",
        dosageForm: "Tablet",
        strength: "500mg",
        batchNumber: "B1",
        expiryDate: "2027-01-01",
        stockUnit: "UNIT",
        unitsPerPack: 1,
        quantity: 10,
        maxQuantity: 100,
        unitPrice: 2,
        lineTotal: 20,
      },
    ];

    vi.mocked(getOfflineBatchesForMedicine).mockResolvedValue([
      {
        tenantId,
        batchId: "batch-1",
        medicineId: "med-1",
        batchNumber: "B1",
        quantityOnHand: 5,
        expiryDate: "2027-01-01",
        retailSalePrice: 2,
        stockUnit: "UNIT",
        unitsPerPack: 1,
      },
    ]);

    const result = await dispenseOffline(mockDb, tenantId, cartLines);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toContain("Insufficient offline stock for Paracetamol");
    }
  });

  it("should successfully dispense and decrement/enqueue on sufficient stock", async () => {
    const cartLines: CartLine[] = [
      {
        id: "line-1",
        medicineId: "med-1",
        stockBatchId: "batch-1",
        genericName: "Paracetamol",
        dosageForm: "Tablet",
        strength: "500mg",
        batchNumber: "B1",
        expiryDate: "2027-01-01",
        stockUnit: "UNIT",
        unitsPerPack: 1,
        quantity: 10,
        maxQuantity: 100,
        unitPrice: 2,
        lineTotal: 20,
      },
    ];

    vi.mocked(getOfflineBatchesForMedicine).mockResolvedValue([
      {
        tenantId,
        batchId: "batch-1",
        medicineId: "med-1",
        batchNumber: "B1",
        quantityOnHand: 8,
        expiryDate: "2027-01-01",
        retailSalePrice: 2,
        stockUnit: "UNIT",
        unitsPerPack: 1,
      },
      {
        tenantId,
        batchId: "batch-2",
        medicineId: "med-1",
        batchNumber: "B2",
        quantityOnHand: 5,
        expiryDate: "2027-02-01",
        retailSalePrice: 2,
        stockUnit: "UNIT",
        unitsPerPack: 1,
      },
    ]);

    vi.mocked(enqueueDispense).mockResolvedValue(42);

    const result = await dispenseOffline(mockDb, tenantId, cartLines);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.queuedId).toBe(42);
      expect(result.receipt.totalAmount).toBe(20);
      expect(result.receipt.lines).toHaveLength(1);
      expect(result.receipt.lines[0]).toEqual({
        genericName: "Paracetamol",
        dosageForm: "Tablet",
        strength: "500mg",
        batchNumber: "B1",
        quantity: 10,
        stockUnit: "UNIT",
        unitsPerPack: 1,
        unitPrice: 2,
        lineTotal: 20,
      });
    }

    expect(decrementOfflineStock).toHaveBeenCalledWith(mockDb, tenantId, [
      { batchId: "batch-1", take: 8 },
      { batchId: "batch-2", take: 2 },
    ]);
    expect(enqueueDispense).toHaveBeenCalled();
  });
});
