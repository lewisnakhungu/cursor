/**
 * Shared TypeScript types for the AfyaSmart offline data layer.
 *
 * These types are intentionally kept separate from server-side types in
 * src/lib/types.ts so they can be imported freely on the client without
 * pulling in any server-only modules.
 */

import type { StockUnitCode } from "@/lib/stock-unit";
import type { ReceiveInventoryInput } from "@/lib/types";

// ---------------------------------------------------------------------------
// Stored records
// ---------------------------------------------------------------------------

/** Trimmed medicine record stored in IndexedDB for offline catalog search. */
export type OfflineMedicine = {
  id: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  levelOfUse: string | null;
  itemType: "MEDICINE" | "NON_PHARM";
  category: string | null;
  /** Pre-normalised, space-joined search string (genericName + aliases). */
  searchKey: string;
  aliases: string[];
};

/** Stock batch record stored per-tenant for offline FEFO dispense. */
export type OfflineStockBatch = {
  tenantId: string;
  batchId: string;
  medicineId: string;
  batchNumber: string | null;
  /** Decremented optimistically when an offline sale is queued. */
  quantityOnHand: number;
  /** ISO date string "YYYY-MM-DD" — used for FEFO ordering. */
  expiryDate: string;
  retailSalePrice: number | null;
  stockUnit: StockUnitCode;
  unitsPerPack: number | null;
};

/** sync_meta record: tracks when a store was last populated. */
export type SyncMeta = {
  key: string;
  /** Unix epoch milliseconds. */
  value: number;
};

// ---------------------------------------------------------------------------
// Pending operation queue
// ---------------------------------------------------------------------------

export type PendingOperationStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "failed";

export type PendingDispense = {
  /** Auto-assigned by IndexedDB autoIncrement. */
  localId?: number;
  type: "DISPENSE";
  tenantId: string;
  /** ISO timestamp — operations older than 24 h are auto-aborted on sync. */
  createdAt: string;
  status: PendingOperationStatus;
  retryCount: number;
  lastError: string | null;
  payload: {
    cartItems: Array<{
      medicineId: string;
      quantity: number;
      stockBatchId?: string;
    }>;
    /** FEFO allocations applied to the offline stock cache — used to roll back on sync failure. */
    allocations: ReadonlyArray<{ batchId: string; take: number }>;
    /** Optimistic receipt generated locally before server confirmation. */
    localReceipt: LocalDispenseReceipt;
  };
};

export type PendingReceive = {
  localId?: number;
  type: "RECEIVE";
  tenantId: string;
  createdAt: string;
  status: PendingOperationStatus;
  retryCount: number;
  lastError: string | null;
  payload: ReceiveInventoryInput;
};

export type PendingOperation = PendingDispense | PendingReceive;

// ---------------------------------------------------------------------------
// Offline receipt
// ---------------------------------------------------------------------------

/** Receipt generated immediately on an offline dispense before server sync. */
export type LocalDispenseReceipt = {
  /** e.g. "LOCAL-20260611-001" — shown on the offline receipt printout. */
  localId: string;
  isOffline: true;
  createdAt: string;
  lines: Array<{
    genericName: string;
    dosageForm: string;
    strength: string;
    batchNumber: string | null;
    quantity: number;
    stockUnit: StockUnitCode;
    unitsPerPack: number | null;
    unitPrice: number;
    lineTotal: number;
  }>;
  totalAmount: number;
};

// ---------------------------------------------------------------------------
// Sync API contract (shared between client and /api/offline/sync route)
// ---------------------------------------------------------------------------

export type SyncRequest = {
  tenantId: string;
  operations: PendingOperation[];
};

export type SyncResultItem = {
  localId: number;
  success: boolean;
  /** Server-assigned sale ID on success. */
  saleId?: string;
  error?: string;
};

export type SyncResponse = {
  results: SyncResultItem[];
};
