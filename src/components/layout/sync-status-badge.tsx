"use client";

/**
 * Network / sync status badge for the app shell header.
 *
 * Shows:
 *  • Nothing       when online and no pending operations
 *  • ⚡ Offline    when navigator.onLine is false
 *  • ↑ N pending   when online but unsynced offline sales exist
 *  • ✓ Synced      briefly after a successful flush (auto-hides after 3 s)
 */

import { useEffect, useState, useCallback } from "react";
import { Wifi, WifiOff, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNetworkStatus } from "@/lib/offline/use-network-status";
import { useOfflineDB } from "@/lib/offline/use-offline-db";
import { pendingCount, abortStaleOperations, markSyncing, markSynced, markFailed, getPendingOperations } from "@/lib/offline/sync-queue";

type SyncState = "idle" | "pending" | "syncing" | "synced" | "error";

export function SyncStatusBadge({ tenantId }: { tenantId: string }) {
  const { isOnline } = useNetworkStatus();
  const db = useOfflineDB();
  const [count, setCount] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>("idle");

  // Poll the pending count from IDB every 5 seconds.
  useEffect(() => {
    if (!db) return;
    let active = true;

    async function refresh() {
      if (!db || !active) return;
      const n = await pendingCount(db, tenantId);
      setCount(n);
      if (n > 0 && syncState === "idle") setSyncState("pending");
      if (n === 0 && syncState === "pending") setSyncState("idle");
    }

    refresh();
    const interval = setInterval(refresh, 5_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [db, tenantId, syncState]);

  // Flush pending operations when we come back online.
  const flush = useCallback(async () => {
    if (!db || !isOnline || syncState === "syncing") return;

    await abortStaleOperations(db);
    const ops = await getPendingOperations(db, tenantId);
    const pending = ops.filter((op) => op.status === "pending");
    if (pending.length === 0) return;

    setSyncState("syncing");

    try {
      for (const op of pending) {
        await markSyncing(db, op.localId!);
      }

      const res = await fetch("/api/offline/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, operations: pending }),
      });

      if (!res.ok) throw new Error(`Sync failed: ${res.status}`);

      const { results } = await res.json();
      for (const r of results) {
        if (r.success) {
          await markSynced(db, r.localId);
        } else {
          await markFailed(db, r.localId, r.error ?? "Unknown error");
        }
      }

      const remaining = await pendingCount(db, tenantId);
      setCount(remaining);
      setSyncState(remaining === 0 ? "synced" : "error");

      // Auto-hide the "synced" confirmation after 3 s.
      if (remaining === 0) {
        setTimeout(() => setSyncState("idle"), 3_000);
      }
    } catch (err) {
      setSyncState("error");
      console.error("[SyncStatusBadge] flush error", err);
    }
  }, [db, isOnline, syncState, tenantId]);

  // Trigger flush whenever we go online.
  useEffect(() => {
    if (isOnline && (syncState === "pending" || count > 0)) {
      flush();
    }
  }, [isOnline, flush, syncState, count]);

  // Listen for SW-initiated sync requests.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "SYNC_REQUESTED") flush();
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [flush]);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  if (isOnline && syncState === "idle" && count === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
        !isOnline && "bg-amber-100 text-amber-800",
        isOnline && syncState === "pending" && "bg-blue-50 text-blue-700",
        isOnline && syncState === "syncing" && "bg-blue-50 text-blue-700",
        isOnline && syncState === "synced" && "bg-emerald-50 text-emerald-700",
        isOnline && syncState === "error" && "bg-red-50 text-red-700",
      )}
      title={
        !isOnline
          ? "No network — offline mode active"
          : syncState === "syncing"
          ? "Uploading offline sales…"
          : syncState === "synced"
          ? "All sales synced"
          : `${count} sale${count !== 1 ? "s" : ""} pending upload`
      }
    >
      {!isOnline && <WifiOff className="size-3" aria-hidden />}
      {isOnline && syncState === "syncing" && (
        <RefreshCw className="size-3 animate-spin" aria-hidden />
      )}
      {isOnline && syncState === "synced" && (
        <CheckCircle2 className="size-3" aria-hidden />
      )}
      {isOnline && syncState === "pending" && (
        <Clock className="size-3" aria-hidden />
      )}
      {isOnline && syncState === "error" && (
        <Wifi className="size-3" aria-hidden />
      )}

      <span className="sr-only">
        {!isOnline ? "Offline" : `${count} pending`}
      </span>
      <span aria-hidden>
        {!isOnline && "Offline"}
        {isOnline && syncState === "syncing" && `Syncing ${count}…`}
        {isOnline && syncState === "synced" && "Synced ✓"}
        {isOnline && syncState === "pending" && `${count} pending`}
        {isOnline && syncState === "error" && "Sync failed"}
      </span>
    </div>
  );
}
