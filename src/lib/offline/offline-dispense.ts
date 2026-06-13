/**
 * Client-side offline dispense logic.
 *
 * When the device has no network, dispenseMedicine() (a server action) cannot
 * be called.  This module provides the offline alternative:
 *
 *  1. Re-runs FEFO allocation against the cached stock batches.
 *  2. Validates that enough stock is available in the cache.
 *  3. Builds an optimistic LocalDispenseReceipt.
 *  4. Decrements the cached stock quantities.
 *  5. Enqueues a PendingDispense in pending_queue.
 *  6. Registers a Background Sync tag so the SW flushes it when online.
 *
 * The server remains the authority: on sync, the real FEFO transaction runs.
 * If it fails (e.g. concurrent online sales depleted the batch), the queue
 * entry is marked "failed" and the pharmacist is notified.
 */

import { allocateFefo } from "@/lib/tenant-scope";
import { decrementOfflineStock, getOfflineBatchesForMedicine } from "@/lib/offline/stock-cache";
import { enqueueDispense, generateLocalId } from "@/lib/offline/sync-queue";
import type { AfyaDB } from "@/lib/offline/db";
import type { CartLine } from "@/stores/cart-store";
import type { LocalDispenseReceipt, PendingDispense } from "@/lib/offline/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OfflineDispenseSuccess = {
  ok: true;
  receipt: LocalDispenseReceipt;
  queuedId: number;
};

export type OfflineDispenseError = {
  ok: false;
  error: string;
};

export type OfflineDispenseResult = OfflineDispenseSuccess | OfflineDispenseError;

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Processes a POS cart as an offline dispense.
 *
 * @param db        Open AfyaDB instance.
 * @param tenantId  Active facility ID from the session.
 * @param cartLines The current cart (from useCartStore).
 */
export async function dispenseOffline(
  db: AfyaDB,
  tenantId: string,
  cartLines: CartLine[],
): Promise<OfflineDispenseResult> {
  if (cartLines.length === 0) {
    return { ok: false, error: "Cart is empty" };
  }

  // -------------------------------------------------------------------------
  // 1. FEFO allocation against cached stock
  // -------------------------------------------------------------------------
  const allAllocations: Array<{ batchId: string; take: number }> = [];
  const receiptLines: LocalDispenseReceipt["lines"] = [];
  const cartItems: PendingDispense["payload"]["cartItems"] = [];

  for (const line of cartLines) {
    const batches = await getOfflineBatchesForMedicine(
      db,
      tenantId,
      line.medicineId,
    );

    const { allocations, shortfall } = allocateFefo(
      batches.map((b) => ({ id: b.batchId, quantityOnHand: b.quantityOnHand })),
      line.quantity,
    );

    if (shortfall > 0) {
      return {
        ok: false,
        error: `Insufficient offline stock for ${line.genericName}. Try syncing first.`,
      };
    }

    allAllocations.push(...allocations.map((a) => ({ batchId: a.batchId, take: a.take })));

    // Use the price from the first allocated batch (best approximation offline).
    const firstBatch = batches.find((b) => b.batchId === allocations[0]?.batchId);
    const unitPrice = firstBatch?.retailSalePrice ?? 0;
    const lineTotal = unitPrice * line.quantity;

    receiptLines.push({
      genericName: line.genericName,
      dosageForm: line.dosageForm,
      strength: line.strength,
      batchNumber: line.batchNumber,
      quantity: line.quantity,
      stockUnit: line.stockUnit,
      unitsPerPack: line.unitsPerPack,
      unitPrice,
      lineTotal,
    });

    // Build the cart item for the sync payload.
    // Use the first allocated batchId so the server can honour the same batch.
    cartItems.push({
      medicineId: line.medicineId,
      quantity: line.quantity,
      stockBatchId: allocations[0]?.batchId,
    });
  }

  // -------------------------------------------------------------------------
  // 2. Optimistic stock decrement
  // -------------------------------------------------------------------------
  await decrementOfflineStock(db, tenantId, allAllocations);

  // -------------------------------------------------------------------------
  // 3. Build the offline receipt
  // -------------------------------------------------------------------------
  const localId = generateLocalId();
  const createdAt = new Date().toISOString();
  const totalAmount = receiptLines.reduce((sum, l) => sum + l.lineTotal, 0);

  const localReceipt: LocalDispenseReceipt = {
    localId,
    isOffline: true,
    createdAt,
    lines: receiptLines,
    totalAmount,
  };

  // -------------------------------------------------------------------------
  // 4. Enqueue in IndexedDB
  // -------------------------------------------------------------------------
  const queuedId = await enqueueDispense(db, tenantId, {
    cartItems,
    allocations: allAllocations,
    localReceipt,
  });

  // -------------------------------------------------------------------------
  // 5. Register Background Sync (best-effort — not all browsers support it)
  // -------------------------------------------------------------------------
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if ("sync" in reg) {
        await (reg as ServiceWorkerRegistration & {
          sync: { register(tag: string): Promise<void> };
        }).sync.register("dispense-sync");
      }
    }
  } catch {
    // Background Sync not supported or blocked — the online event handler
    // in PwaProvider will trigger a manual flush instead.
  }

  return { ok: true, receipt: localReceipt, queuedId };
}
