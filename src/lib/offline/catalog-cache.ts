/**
 * KEML medicine catalog — offline cache helpers.
 *
 * The catalog is tenant-agnostic (shared KEML data), so it is stored once
 * for the whole app.  After the first online visit to the POS page, the
 * catalog is populated from /api/offline/catalog.  A 24-hour staleness
 * window triggers a background refresh.
 */

import { IDBKeyRange } from "idb";
import type { AfyaDB } from "@/lib/offline/db";
import type { OfflineMedicine } from "@/lib/offline/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const META_KEY = "catalog_last_synced";
export const CATALOG_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// Freshness check
// ---------------------------------------------------------------------------

/** Returns true if the catalog was populated within the last 24 hours. */
export async function isCatalogFresh(db: AfyaDB): Promise<boolean> {
  const meta = await db.get("sync_meta", META_KEY);
  if (!meta) return false;
  return Date.now() - meta.value < CATALOG_STALE_MS;
}

/** Returns the ISO timestamp of the last catalog sync, or null. */
export async function catalogLastSynced(db: AfyaDB): Promise<string | null> {
  const meta = await db.get("sync_meta", META_KEY);
  if (!meta) return null;
  return new Date(meta.value).toISOString();
}

// ---------------------------------------------------------------------------
// Normalise query (mirrors server-side normalizeQuery in catalog.ts)
// ---------------------------------------------------------------------------

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Population
// ---------------------------------------------------------------------------

/**
 * Replaces the entire catalog store with the given medicines.
 * Called after fetching /api/offline/catalog while online.
 */
export async function populateCatalog(
  db: AfyaDB,
  medicines: OfflineMedicine[],
): Promise<void> {
  const tx = db.transaction(["catalog_medicines", "sync_meta"], "readwrite");

  // Clear and re-populate atomically within one transaction.
  await tx.objectStore("catalog_medicines").clear();
  for (const m of medicines) {
    await tx.objectStore("catalog_medicines").put(m);
  }
  await tx.objectStore("sync_meta").put({ key: META_KEY, value: Date.now() });
  await tx.done;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Searches the offline catalog by prefix on the searchKey index,
 * with an alias fallback full scan.
 *
 * Returns at most 30 results, sorted: in-stock-favouring order is
 * unavailable offline (no live stock data), so results are alphabetical.
 */
export async function searchOfflineCatalog(
  db: AfyaDB,
  query: string,
): Promise<OfflineMedicine[]> {
  const normalized = normalizeQuery(query);
  if (normalized.length < 2) return [];

  // Primary: index prefix scan on searchKey.
  const indexResults = await db.getAllFromIndex(
    "catalog_medicines",
    "searchKey",
    IDBKeyRange.bound(normalized, normalized + "\uffff"),
    30,
  );

  if (indexResults.length > 0) {
    return indexResults;
  }

  // Fallback: full scan for alias matches (~1,500 records — acceptable).
  const all = await db.getAll("catalog_medicines");
  const q = query.toLowerCase();
  return all
    .filter((m) => m.aliases.some((a) => a.toLowerCase().includes(q)))
    .slice(0, 30);
}

/** Returns a single medicine by ID from the offline cache. */
export async function getOfflineMedicine(
  db: AfyaDB,
  medicineId: string,
): Promise<OfflineMedicine | undefined> {
  return db.get("catalog_medicines", medicineId);
}

/** Total number of medicines cached offline. */
export async function catalogSize(db: AfyaDB): Promise<number> {
  return db.count("catalog_medicines");
}
