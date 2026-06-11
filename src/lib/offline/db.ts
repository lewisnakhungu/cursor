/**
 * IndexedDB schema definition and open helper for AfyaSmart offline storage.
 *
 * Database: "afyasmart-offline"  Version: 1
 *
 * Object stores
 * ─────────────
 *  catalog_medicines  keyPath: "id"
 *    index "searchKey" (non-unique) — prefix-scan for offline search
 *
 *  tenant_stock       keyPath: ["tenantId", "batchId"]
 *    index "byMedicine" — [tenantId, medicineId, expiryDate]
 *
 *  pending_queue      keyPath: "localId" (autoIncrement)
 *    index "byTenant"  — [tenantId, createdAt]
 *    index "byStatus"  — status
 *
 *  sync_meta          keyPath: "key"
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  OfflineMedicine,
  OfflineStockBatch,
  PendingOperation,
  SyncMeta,
} from "@/lib/offline/types";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

interface AfyaDBSchema extends DBSchema {
  catalog_medicines: {
    key: string;
    value: OfflineMedicine;
    indexes: { searchKey: string };
  };
  tenant_stock: {
    key: [string, string]; // [tenantId, batchId]
    value: OfflineStockBatch;
    indexes: { byMedicine: [string, string, string] }; // [tenantId, medicineId, expiryDate]
  };
  pending_queue: {
    key: number; // autoIncrement localId
    value: PendingOperation;
    indexes: {
      byTenant: [string, string]; // [tenantId, createdAt]
      byStatus: string;
    };
  };
  sync_meta: {
    key: string;
    value: SyncMeta;
  };
}

export type AfyaDB = IDBPDatabase<AfyaDBSchema>;

// ---------------------------------------------------------------------------
// Singleton promise — one open DB per page lifetime
// ---------------------------------------------------------------------------

let _db: Promise<AfyaDB> | null = null;

/**
 * Opens (or returns the cached) AfyaSmart offline database.
 * Safe to call multiple times — always returns the same promise.
 */
export function openAfyaDB(): Promise<AfyaDB> {
  if (!_db) {
    _db = openDB<AfyaDBSchema>("afyasmart-offline", 1, {
      upgrade(db) {
        // catalog_medicines ------------------------------------------------
        const medicineStore = db.createObjectStore("catalog_medicines", {
          keyPath: "id",
        });
        medicineStore.createIndex("searchKey", "searchKey", { unique: false });

        // tenant_stock -----------------------------------------------------
        const stockStore = db.createObjectStore("tenant_stock", {
          keyPath: ["tenantId", "batchId"],
        });
        stockStore.createIndex("byMedicine", ["tenantId", "medicineId", "expiryDate"], {
          unique: false,
        });

        // pending_queue ----------------------------------------------------
        const queueStore = db.createObjectStore("pending_queue", {
          keyPath: "localId",
          autoIncrement: true,
        });
        queueStore.createIndex("byTenant", ["tenantId", "createdAt"], {
          unique: false,
        });
        queueStore.createIndex("byStatus", "status", { unique: false });

        // sync_meta --------------------------------------------------------
        db.createObjectStore("sync_meta", { keyPath: "key" });
      },
    });
  }
  return _db;
}

/** Reset the singleton (useful in tests). */
export function _resetDBSingleton(): void {
  _db = null;
}
