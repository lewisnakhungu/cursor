"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openAfyaDB } from "@/lib/offline/db";
import { isCatalogFresh, populateCatalog } from "@/lib/offline/catalog-cache";

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
  const seedCatalog = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const db = await openAfyaDB();
      if (await isCatalogFresh(db)) return;

      const res = await fetch("/api/offline/catalog");
      if (!res.ok) return;

      const { medicines } = await res.json();
      if (Array.isArray(medicines) && medicines.length > 0) {
        await populateCatalog(db, medicines);
      }
    } catch {
      // Non-critical — catalog will be seeded on next load.
    }
  }, []);

  // -----------------------------------------------------------------------
  // Bootstrap
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    setIsStandalone(standalone);

    // Register the service worker.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        // Seed the catalog once the SW is active.
        seedCatalog();

        // Listen for messages relayed by the SW.
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "CATALOG_REFRESH_REQUESTED") {
            // Force-refresh by clearing the freshness timestamp.
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

    // Seed catalog on first mount if online.
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
