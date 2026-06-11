"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wifi, WifiOff, RefreshCw, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Read pending offline operations count from IndexedDB without importing
 *  the full offline DB module (keeps this page statically renderable). */
async function getPendingCount(): Promise<number> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("afyasmart-offline");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!db.objectStoreNames.contains("pending_queue")) {
      db.close();
      return 0;
    }
    const tx = db.transaction("pending_queue", "readonly");
    const count = await new Promise<number>((resolve, reject) => {
      const idx = tx.objectStore("pending_queue").index("byStatus");
      const req = idx.count(IDBKeyRange.only("pending"));
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return count;
  } catch {
    return 0;
  }
}

const CAPABILITIES = [
  { label: "Dispense from cached stock", available: true },
  { label: "Medicine search (cached catalog)", available: true },
  { label: "Receive new inventory", available: false },
  { label: "Sales reports & insights", available: false },
];

export default function OfflinePage() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Load pending count from IDB
    getPendingCount().then(setPendingCount);

    // Detect initial state
    setIsOnline(navigator.onLine);
    setChecking(false);

    const handleOnline = () => {
      setIsOnline(true);
      // Give the SW a moment to flush, then redirect.
      setTimeout(() => router.replace("/dashboard"), 800);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Status icon */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
              isOnline
                ? "bg-primary/10 text-primary"
                : "bg-amber-50 text-amber-600"
            }`}
          >
            {isOnline ? (
              <Wifi className="size-8" />
            ) : (
              <WifiOff className="size-8" />
            )}
          </div>

          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {isOnline ? "Connection restored" : "You're offline"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isOnline
                ? "Redirecting you back to the dashboard…"
                : "AfyaSmart-Stock is running in offline mode."}
            </p>
          </div>
        </div>

        {/* Capabilities */}
        {!isOnline && (
          <div className="pharmacy-panel space-y-2">
            <p className="pharmacy-panel-title mb-3">Offline capabilities</p>
            {CAPABILITIES.map(({ label, available }) => (
              <div key={label} className="flex items-center gap-2.5 text-sm">
                {available ? (
                  <CheckCircle2 className="size-4 shrink-0 text-primary" />
                ) : (
                  <XCircle className="size-4 shrink-0 text-muted-foreground/60" />
                )}
                <span
                  className={available ? "text-foreground" : "text-muted-foreground/70"}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Pending sync badge */}
        {!isOnline && pendingCount > 0 && (
          <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Clock className="size-4 shrink-0" />
            <span>
              <strong>{pendingCount}</strong>{" "}
              {pendingCount === 1 ? "sale" : "sales"} pending sync — will upload
              automatically when you reconnect.
            </span>
          </div>
        )}

        {/* Connection status */}
        {!isOnline && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            {checking ? (
              <>
                <RefreshCw className="size-3 animate-spin" />
                Checking connection…
              </>
            ) : (
              <>
                <span className="inline-block size-2 rounded-full bg-amber-400" />
                No network detected
              </>
            )}
          </div>
        )}

        {/* Return to POS button (offline mode) */}
        {!isOnline && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push("/pos")}
          >
            Go to Dispense (offline)
          </Button>
        )}
      </div>
    </div>
  );
}
