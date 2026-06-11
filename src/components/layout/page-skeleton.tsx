import { cn } from "@/lib/utils";

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-muted", className)}
      aria-hidden
    />
  );
}

/** Generic route-loading skeleton used by every route's loading.tsx. */
export function PageSkeleton() {
  return (
    <div
      className="space-y-4 p-4 sm:p-6"
      role="status"
      aria-label="Loading page"
    >
      <Shimmer className="h-8 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Shimmer className="h-24" />
        <Shimmer className="h-24" />
        <Shimmer className="h-24" />
        <Shimmer className="h-24" />
      </div>
      <Shimmer className="h-64" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
