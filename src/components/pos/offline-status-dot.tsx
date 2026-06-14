"use client";

import { cn } from "@/lib/utils";

export type OfflineConnectionState =
  | "online"
  | "offline-ready"
  | "offline-missing";

type OfflineStatusDotProps = {
  state: OfflineConnectionState;
  /** Shown on hover / for screen readers */
  label: string;
  className?: string;
  onRetry?: () => void;
};

const STATE_STYLES: Record<
  OfflineConnectionState,
  { dot: string; glow: string }
> = {
  online: {
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_10px_3px_rgba(52,211,153,0.85)]",
  },
  "offline-ready": {
    dot: "bg-sky-400",
    glow: "shadow-[0_0_10px_3px_rgba(56,189,248,0.85)]",
  },
  "offline-missing": {
    dot: "bg-red-500",
    glow: "shadow-[0_0_10px_3px_rgba(239,68,68,0.85)]",
  },
};

export function OfflineStatusDot({
  state,
  label,
  className,
  onRetry,
}: OfflineStatusDotProps) {
  const styles = STATE_STYLES[state];

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/80 px-2 py-1",
        onRetry && state === "offline-missing" && "cursor-pointer hover:bg-muted/50",
        !onRetry && "cursor-default",
        className,
      )}
      title={label}
      aria-label={label}
      onClick={onRetry && state === "offline-missing" ? onRetry : undefined}
    >
      <span
        className={cn(
          "size-3 shrink-0 rounded-full",
          styles.dot,
          styles.glow,
          state === "online" && "animate-pulse",
        )}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function resolveOfflineDotState(input: {
  isOnline: boolean;
  offlineModeEnabled: boolean;
  cacheReady: boolean;
  cacheLoading: boolean;
}): { state: OfflineConnectionState; label: string } {
  const { isOnline, offlineModeEnabled, cacheReady, cacheLoading } = input;

  if (!offlineModeEnabled) {
    if (isOnline) {
      return { state: "online", label: "Online — offline dispense disabled by owner" };
    }
    return {
      state: "offline-missing",
      label: "Offline — enable offline mode in Facility settings (owner only)",
    };
  }

  if (isOnline) {
    if (cacheLoading) {
      return { state: "online", label: "Online — preparing offline cache…" };
    }
    if (cacheReady) {
      return { state: "online", label: "Online — offline cache ready" };
    }
    return { state: "online", label: "Online — offline cache not loaded yet" };
  }

  if (cacheReady) {
    return { state: "offline-ready", label: "Offline — cached catalog ready" };
  }

  return {
    state: "offline-missing",
    label: "Offline — no cache. Connect on POS while signed in first.",
  };
}
