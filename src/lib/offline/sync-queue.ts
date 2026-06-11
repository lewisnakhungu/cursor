/**
 * Pending operation queue — enqueue, dequeue, and status helpers.
 *
 * Every offline dispense or receive is stored here until it is successfully
 * synced to the server.  Entries transition through:
 *   pending → syncing → synced  (happy path)
 *   pending → syncing → failed  (server rejected or network unavailable)
 *
 * Failed entries can be retried; entries older than MAX_OPERATION_AGE_MS are
 * auto-aborted to prevent stale dispenses from ever being committed.
 */

import { IDBKeyRange } from "idb";
import type { AfyaDB } from "@/lib/offline/db";
import type {
  PendingDispense,
  PendingOperation,
  PendingOperationStatus,
  PendingReceive,
} from "@/lib/offline/types";

/** Operations older than this are never synced (stale dispense risk). */
export const MAX_OPERATION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _localCounter = 0;

/**
 * Generates a human-readable local sale ID for offline receipts.
 * Format: "LOCAL-YYYYMMDD-NNN"
 */
export function generateLocalId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  _localCounter = (_localCounter + 1) % 1000;
  return `LOCAL-${date}-${String(_localCounter).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

/** Adds a pending dispense to the queue. Returns the auto-assigned localId. */
export async function enqueueDispense(
  db: AfyaDB,
  tenantId: string,
  payload: PendingDispense["payload"],
): Promise<number> {
  return db.add("pending_queue", {
    type: "DISPENSE",
    tenantId,
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    lastError: null,
    payload,
  } as PendingDispense);
}

/** Adds a pending receive to the queue. Returns the auto-assigned localId. */
export async function enqueueReceive(
  db: AfyaDB,
  tenantId: string,
  payload: PendingReceive["payload"],
): Promise<number> {
  return db.add("pending_queue", {
    type: "RECEIVE",
    tenantId,
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    lastError: null,
    payload,
  } as PendingReceive);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** All operations for a tenant ordered by creation time (oldest first). */
export async function getPendingOperations(
  db: AfyaDB,
  tenantId: string,
): Promise<PendingOperation[]> {
  return db.getAllFromIndex(
    "pending_queue",
    "byTenant",
    IDBKeyRange.bound([tenantId], [tenantId, "\uffff"]),
  );
}

/** Count of operations with status "pending" for a tenant. */
export async function pendingCount(
  db: AfyaDB,
  tenantId: string,
): Promise<number> {
  const all = await getPendingOperations(db, tenantId);
  return all.filter((op) => op.status === "pending").length;
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

async function setStatus(
  db: AfyaDB,
  localId: number,
  status: PendingOperationStatus,
  patch?: Partial<PendingOperation>,
): Promise<void> {
  const op = await db.get("pending_queue", localId);
  if (!op) return;
  await db.put("pending_queue", { ...op, ...patch, status } as PendingOperation);
}

export async function markSyncing(db: AfyaDB, localId: number): Promise<void> {
  await setStatus(db, localId, "syncing");
}

export async function markSynced(db: AfyaDB, localId: number): Promise<void> {
  await setStatus(db, localId, "synced");
}

export async function markFailed(
  db: AfyaDB,
  localId: number,
  error: string,
): Promise<void> {
  const op = await db.get("pending_queue", localId);
  if (!op) return;
  await db.put("pending_queue", {
    ...op,
    status: "failed",
    retryCount: op.retryCount + 1,
    lastError: error,
  } as PendingOperation);
}

/** Resets a failed operation back to pending for manual retry. */
export async function requeueFailed(
  db: AfyaDB,
  localId: number,
): Promise<void> {
  await setStatus(db, localId, "pending", { lastError: null });
}

// ---------------------------------------------------------------------------
// Stale operation guard
// ---------------------------------------------------------------------------

/**
 * Marks as failed any pending operations that are older than 24 hours.
 * Called at the start of every sync attempt.
 */
export async function abortStaleOperations(db: AfyaDB): Promise<void> {
  const cutoff = new Date(Date.now() - MAX_OPERATION_AGE_MS).toISOString();
  const all = await db.getAllFromIndex("pending_queue", "byStatus", "pending");
  for (const op of all) {
    if (op.createdAt < cutoff) {
      await markFailed(
        db,
        op.localId!,
        "Operation expired: queued more than 24 hours ago",
      );
    }
  }
}
