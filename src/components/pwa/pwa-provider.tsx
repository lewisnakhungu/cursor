"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openAfyaDB } from "@/lib/offline/db";
import { isCatalogFresh, ensureCatalogCached } from "@/lib/offline/catalog-cache";

const DISMISS_KEY = "afyasmart-pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * PwaProvider — mounts once in the root layout and handles:
 *
 *  1. Service worker registration
 *  2. Deferred install prompt banner
 *  3. Offline catalog seeding (fetches /api/offline/catalog when online
 *     and the cached catalog is stale or missing)
 *  4. SW → client message relay (SYNC_REQUESTED, CATALOG_REFRESH_REQUESTED)
 */
export function PwaProvider() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // -----------------------------------------------------------------------
  // Catalog seeding
  // -----------------------------------------------------------------------
  const registerCatalogRefreshSync = useCallback(async () => {
    try {
      if (!("serviceWorker" in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      if (!("sync" in reg)) return;
      await (
        reg as ServiceWorkerRegistration & {
          sync: { register(tag: string): Promise<void> };
        }
      ).sync.register("catalog-refresh");
    } catch {
      // Background Sync unsupported — online event still refreshes the catalog.
    }
  }, []);

  const seedCatalog = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const modeRes = await fetch("/api/facility/offline-mode");
      if (!modeRes.ok) return;
      const { enabled } = (await modeRes.json()) as { enabled?: boolean };
      if (!enabled) return;

      const db = await openAfyaDB();
      if (await isCatalogFresh(db)) return;

      await registerCatalogRefreshSync();
      await ensureCatalogCached(db);
    } catch {
      // POS shows explicit cache status when the user opens dispense.
    }
  }, [registerCatalogRefreshSync]);

  // -----------------------------------------------------------------------
  // Bootstrap
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isProd = process.env.NODE_ENV === "production";

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    setIsStandalone(standalone);

    // In development, unregister any service worker so Next.js dev assets
    // (volatile ?v= chunk URLs) are never intercepted by cache-first SW logic.
    if (!isProd && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
    }

    // Register the service worker (production only).
    if (isProd && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        seedCatalog();

        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "CATALOG_REFRESH_REQUESTED") {
            openAfyaDB()
              .then((db) => db.delete("sync_meta", "catalog_last_synced"))
              .then(() => seedCatalog());
          }
        });

        return reg;
      }).catch(() => {
        /* optional — install may still work on some browsers */
      });
    }

    // Seed catalog on first mount if online (dev + prod).
    seedCatalog();

    // Re-seed when the user comes back online.
    window.addEventListener("online", seedCatalog);

    // Deferred install prompt.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!standalone && !localStorage.getItem(DISMISS_KEY)) {
        setShowBanner(true);
      }
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    return () => {
      window.removeEventListener("online", seedCatalog);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, [seedCatalog]);

  // -----------------------------------------------------------------------
  // Install banner handlers
  // -----------------------------------------------------------------------
  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShowBanner(false);
  };

  if (isStandalone || !showBanner || !deferredPrompt) {
    return null;
  }

  // -----------------------------------------------------------------------
  // Install banner UI
  // -----------------------------------------------------------------------
  return (
    <div
      className={cn(
        "fixed bottom-0 inset-x-0 z-[60] border-t border-border/80 bg-background/95 p-3 shadow-lg backdrop-blur-md",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      )}
      role="region"
      aria-label="Install app"
    >
      <div className="mx-auto flex max-w-lg flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 pe-2">
          <p className="text-sm font-semibold">Install AfyaSmart-Stock</p>
          <p className="text-xs text-muted-foreground">
            Add to your home screen for quick dispense and stock access.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" size="sm" className="gap-1.5" onClick={handleInstall}>
            <Download className="size-4" aria-hidden />
            Install
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8 shrink-0"
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
