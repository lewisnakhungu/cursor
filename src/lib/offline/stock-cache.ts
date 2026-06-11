/**
 * Tenant stock batch cache — offline helpers.
 *
 * Stock is tenant-specific, so all records are keyed by [tenantId, batchId].
 * Staleness window: 5 minutes.  On every online POS mount the hook refreshes
 * the cache; optimistic decrements are applied immediately on offline dispense.
 */

import type { AfyaDB } from "@/lib/offline/db";
import type { OfflineStockBatch } from "@/lib/offline/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STOCK_STALE_MS = 5 * 60 * 1000; // 5 minutes

function stockMetaKey(tenantId: string): string {
  return `stock_${tenantId}_last_synced`;
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

/** Returns true if stock for this tenant was cached within the last 5 minutes. */
export async function isStockFresh(
  db: AfyaDB,
  tenantId: string,
): Promise<boolean> {
  const meta = await db.get("sync_meta", stockMetaKey(tenantId));
  if (!meta) return false;
  return Date.now() - meta.value < STOCK_STALE_MS;
}

// ---------------------------------------------------------------------------
// Population
// ---------------------------------------------------------------------------

/**
 * Replaces all cached batches for one tenant.
 * Called after fetching active stock while online.
 */
export async function populateTenantStock(
  db: AfyaDB,
  tenantId: string,
  batches: OfflineStockBatch[],
): Promise<void> {
  const tx = db.transaction(["tenant_stock", "sync_meta"], "readwrite");
  const store = tx.objectStore("tenant_stock");

  // Delete existing records for this tenant.
  let cursor = await store
    .index("byMedicine")
    .openCursor(
      IDBKeyRange.bound([tenantId], [tenantId, "\uffff", "\uffff"]),
    );
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  for (const b of batches) {
    await store.put(b);
  }

  await tx
    .objectStore("sync_meta")
    .put({ key: stockMetaKey(tenantId), value: Date.now() });

  await tx.done;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Returns non-expired, non-zero-quantity batches for one medicine,
 * sorted FEFO (nearest expiry first) — mirrors the server dispense query.
 */
export async function getOfflineBatchesForMedicine(
  db: AfyaDB,
  tenantId: string,
  medicineId: string,
): Promise<OfflineStockBatch[]> {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  // Index key: [tenantId, medicineId, expiryDate]
  const batches = await db.getAllFromIndex(
    "tenant_stock",
    "byMedicine",
    IDBKeyRange.bound(
      [tenantId, medicineId, today],
      [tenantId, medicineId, "9999-99-99"],
    ),
  );

  return batches
    .filter((b) => b.quantityOnHand > 0)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}

/**
 * Optimistically decrements stock quantities when an offline sale is queued.
 * If the batch has less than `take`, clamps to 0 (server enforces correctness
 * at sync time).
 */
export async function decrementOfflineStock(
  db: AfyaDB,
  tenantId: string,
  allocations: ReadonlyArray<{ batchId: string; take: number }>,
): Promise<void> {
  const tx = db.transaction("tenant_stock", "readwrite");
  for (const { batchId, take } of allocations) {
    const record = await tx.store.get([tenantId, batchId]);
    if (record) {
      await tx.store.put({
        ...record,
        quantityOnHand: Math.max(0, record.quantityOnHand - take),
      });
    }
  }
  await tx.done;
}

/**
 * Restores stock quantities on sync failure — rolls back the optimistic
 * decrement so the UI reflects reality until the next cache refresh.
 */
export async function restoreOfflineStock(
  db: AfyaDB,
  tenantId: string,
  allocations: ReadonlyArray<{ batchId: string; take: number }>,
): Promise<void> {
  const tx = db.transaction("tenant_stock", "readwrite");
  for (const { batchId, take } of allocations) {
    const record = await tx.store.get([tenantId, batchId]);
    if (record) {
      await tx.store.put({
        ...record,
        quantityOnHand: record.quantityOnHand + take,
      });
    }
  }
  await tx.done;
}
