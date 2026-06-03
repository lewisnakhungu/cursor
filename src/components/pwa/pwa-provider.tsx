"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "afyasmart-pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaProvider() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    setIsStandalone(standalone);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* optional — install may still work on some browsers */
      });
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!standalone && !localStorage.getItem(DISMISS_KEY)) {
        setShowBanner(true);
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

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
