import { create } from "zustand";
import { normalizeStockUnit, type StockUnitCode } from "@/lib/stock-unit";

export type CartLine = {
  id: string;
  medicineId: string;
  stockBatchId: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  batchNumber: string | null;
  expiryDate: string;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
  quantity: number;
  maxQuantity: number;
  unitPrice: number;
  lineTotal: number;
};

type CartState = {
  lines: CartLine[];
  addLine: (line: Omit<CartLine, "id" | "lineTotal">) => void;
  removeLine: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clear: () => void;
  cartTotal: () => number;
};

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  addLine: (line) =>
    set((state) => {
      const quantity = Math.min(line.quantity, line.maxQuantity);
      const lineTotal = line.unitPrice * quantity;

      const existing = state.lines.find(
        (entry) => entry.stockBatchId === line.stockBatchId,
      );

      if (existing) {
        const mergedQty = Math.min(
          existing.quantity + quantity,
          line.maxQuantity,
        );
        return {
          lines: state.lines.map((entry) =>
            entry.id === existing.id
              ? {
                  ...entry,
                  quantity: mergedQty,
                  lineTotal: entry.unitPrice * mergedQty,
                }
              : entry,
          ),
        };
      }

      return {
        lines: [
          ...state.lines,
          {
            ...line,
            stockUnit: normalizeStockUnit(line.stockUnit),
            id: crypto.randomUUID(),
            quantity,
            lineTotal,
          },
        ],
      };
    }),
  removeLine: (id) =>
    set((state) => ({
      lines: state.lines.filter((line) => line.id !== id),
    })),
  updateQuantity: (id, quantity) =>
    set((state) => ({
      lines: state.lines.map((line) => {
        if (line.id !== id) return line;
        const q = Math.max(1, Math.min(quantity, line.maxQuantity));
        return {
          ...line,
          quantity: q,
          lineTotal: line.unitPrice * q,
        };
      }),
    })),
  clear: () => set({ lines: [] }),
  cartTotal: () =>
    get().lines.reduce((sum, line) => sum + line.lineTotal, 0),
}));
