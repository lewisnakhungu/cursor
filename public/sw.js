/**
 * AfyaSmart-Stock — Service Worker
 *
 * Caching strategies:
 *   /_next/static/*   → Cache-first (immutable content-hash filenames)
 *   Navigation HTML   → Network-first, fallback to cache, then /offline
 *   Other same-origin → Network-first, fallback to cache
 *   RSC / API / data  → Network-only (never cached)
 *
 * Bump CACHE_VERSION on every release that adds or removes shell assets.
 * The activate handler deletes all older caches automatically.
 */

const CACHE_VERSION = 5;
const SHELL_CACHE = `afyasmart-shell-v${CACHE_VERSION}`;
const STATIC_CACHE = `afyasmart-static-v${CACHE_VERSION}`;

/** App-shell pages pre-cached at install time. */
const SHELL_ASSETS = [
  "/",
  "/login",
  "/dashboard",
  "/pos",
  "/offline.html",
  "/icon.svg",
  "/apple-icon.svg",
];

// ---------------------------------------------------------------------------
// Install — pre-cache shell assets
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// ---------------------------------------------------------------------------
// Activate — delete stale caches from previous versions
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  const currentCaches = new Set([SHELL_CACHE, STATIC_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !currentCaches.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------------
// Fetch — route each request to the right strategy
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only intercept GET requests from the same origin.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept local dev — Next.js uses volatile ?v= chunk URLs that
  // must not be cached with production cache-first semantics.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;

  // --- Network-only: RSC payloads, Next.js data routes, and API ---
  if (isNetworkOnly(url, request)) return;

  // --- Cache-first: Next.js immutable static chunks ---
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // --- Network-first: navigation and everything else ---
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigate(request));
    return;
  }

  event.respondWith(networkFirst(request, SHELL_CACHE));
});

// ---------------------------------------------------------------------------
// Background Sync — flush pending offline operations
// ---------------------------------------------------------------------------
self.addEventListener("sync", (event) => {
  if (event.tag === "dispense-sync") {
    event.waitUntil(flushPendingDispenses());
  }
  if (event.tag === "catalog-refresh") {
    event.waitUntil(refreshCatalog());
  }
});

// ---------------------------------------------------------------------------
// Strategy helpers
// ---------------------------------------------------------------------------

/** Patterns that must ALWAYS go to the network (never served from cache). */
function isNetworkOnly(url, request) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.pathname.startsWith("/__nextjs") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1" ||
    request.headers.get("Next-Router-State-Tree") !== null
  );
}

/**
 * Cache-first: serve from cache immediately; if missing, fetch, store, return.
 * Ideal for content-hash-named assets that never change.
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Static asset not cached and network failed — return a 503.
    return new Response("Static asset unavailable offline", { status: 503 });
  }
}

/**
 * Network-first for navigation: try network, update cache on success,
 * fall back to cached page, and finally fall back to /offline.
 */
async function networkFirstNavigate(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Last resort: serve the offline page.
    const offline = await caches.match("/offline.html");
    return offline ?? new Response("You are offline", { status: 503 });
  }
}

/**
 * Network-first for non-navigation requests: try network, fall back to cache.
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response("Offline", { status: 503 });
  }
}

// ---------------------------------------------------------------------------
// Background Sync handlers
// ---------------------------------------------------------------------------

async function flushPendingDispenses() {
  // Implemented in Phase 4: reads pending_queue from IndexedDB and
  // POSTs to /api/offline/sync. Stubbed here so the sync event is
  // registered and handled without throwing.
  try {
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((client) => client.postMessage({ type: "SYNC_REQUESTED" }));
  } catch {
    // Silently ignore — the client-side hook handles sync independently.
  }
}

async function refreshCatalog() {
  // Implemented in Phase 3: triggers a catalog re-seed from /api/offline/catalog.
  try {
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((client) =>
      client.postMessage({ type: "CATALOG_REFRESH_REQUESTED" }),
    );
  } catch {
    // Silently ignore.
  }
}
