"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { AfyaSmartLogo } from "@/components/brand/afyasmart-logo";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <AfyaSmartLogo size={48} />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The error has been reported automatically. Your stock and sales data
        are safe — try again, or go back to the dashboard.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
