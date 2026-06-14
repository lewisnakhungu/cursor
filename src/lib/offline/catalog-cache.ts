/**
 * KEML medicine catalog — offline cache helpers.
 *
 * The catalog is tenant-agnostic (shared KEML data), so it is stored once
 * for the whole app.  Populated from /api/offline/catalog on any signed-in
 * page load (PwaProvider) and proactively on POS mount.  A 24-hour staleness
 * window triggers a background refresh.
 */

import type { AfyaDB } from "@/lib/offline/db";
import type { OfflineMedicine } from "@/lib/offline/types";
import { fetchWithTimeout } from "@/lib/offline/fetch-with-timeout";
import { parseJsonResponse } from "@/lib/offline/parse-json-response";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const META_KEY = "catalog_last_synced";
export const CATALOG_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
const PUT_CHUNK_SIZE = 500;

let catalogRefreshInFlight: Promise<boolean> | null = null;

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
  const store = tx.objectStore("catalog_medicines");

  await store.clear();
  for (let i = 0; i < medicines.length; i += PUT_CHUNK_SIZE) {
    const chunk = medicines.slice(i, i + PUT_CHUNK_SIZE);
    await Promise.all(chunk.map((m) => store.put(m)));
  }
  await tx.objectStore("sync_meta").put({ key: META_KEY, value: Date.now() });
  await tx.done;
}

export type CatalogRefreshResult =
  | { ok: true; refreshed: boolean; count: number }
  | { ok: false; error: string; count: number };

/**
 * Ensures the KEML catalog is in IndexedDB. Single-flight: concurrent callers
 * share one download/write so PwaProvider + POS cannot deadlock each other.
 */
export async function ensureCatalogCached(db: AfyaDB): Promise<CatalogRefreshResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const count = await catalogSize(db);
    return count > 0
      ? { ok: true, refreshed: false, count }
      : { ok: false, error: "Offline — connect to download the medicine catalog.", count: 0 };
  }

  if (await isCatalogFresh(db)) {
    return { ok: true, refreshed: false, count: await catalogSize(db) };
  }

  if (!catalogRefreshInFlight) {
    catalogRefreshInFlight = (async () => {
      try {
        const res = await fetchWithTimeout("/api/offline/catalog");
        if (res.status === 401) {
          throw new Error("Sign in required to cache medicines for offline use.");
        }
        if (!res.ok) {
          throw new Error(`Catalog download failed (${res.status}).`);
        }

        const body = await parseJsonResponse<{ medicines?: OfflineMedicine[] }>(res);
        if (!Array.isArray(body.medicines) || body.medicines.length === 0) {
          throw new Error("Server returned an empty medicine catalog.");
        }

        await populateCatalog(db, body.medicines);
        return true;
      } finally {
        catalogRefreshInFlight = null;
      }
    })();
  }

  try {
    const refreshed = await catalogRefreshInFlight;
    return { ok: true, refreshed, count: await catalogSize(db) };
  } catch (err) {
    const count = await catalogSize(db);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Catalog download failed.",
      count,
    };
  }
}

/**
 * Fetches the full KEML catalog from the server when the cache is stale or
 * empty. Returns true when a new catalog was written to IndexedDB.
 */
export async function refreshCatalogIfStale(db: AfyaDB): Promise<boolean> {
  const result = await ensureCatalogCached(db);
  return result.ok && result.refreshed;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Searches the offline catalog by prefix on the searchKey index,
 * with an alias fallback full scan.
 */
export async function searchOfflineCatalog(
  db: AfyaDB,
  query: string,
): Promise<OfflineMedicine[]> {
  const normalized = normalizeQuery(query);
  if (normalized.length < 2) return [];

  const indexResults = await db.getAllFromIndex(
    "catalog_medicines",
    "searchKey",
    IDBKeyRange.bound(normalized, normalized + "\uffff"),
    30,
  );

  if (indexResults.length > 0) {
    return indexResults;
  }

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
