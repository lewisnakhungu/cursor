"use client";

/**
 * Returns the current network connectivity state and subscribes to changes.
 *
 * Uses navigator.onLine as the initial value (fast, synchronous) and
 * then listens to the browser's "online"/"offline" events.
 *
 * Note: navigator.onLine can be true even with no internet (e.g. LAN only).
 * For the POS workflow this is acceptable — the server action will fail and
 * the UI falls back to the offline path gracefully.
 */

import { useEffect, useState } from "react";

export type NetworkStatus = {
  isOnline: boolean;
};

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Sync with real state in case it changed between render and mount.
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}
