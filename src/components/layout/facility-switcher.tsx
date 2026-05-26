"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { switchActiveFacility } from "@/lib/actions/auth";
import { useCartStore } from "@/stores/cart-store";
import type { SessionPayload } from "@/lib/auth/session-types";
import { getActiveFacilityName } from "@/lib/auth/session-types";
import { cn } from "@/lib/utils";

type FacilitySwitcherProps = {
  session: SessionPayload;
  className?: string;
};

export function FacilitySwitcher({ session, className }: FacilitySwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const clearCart = useCartStore((s) => s.clear);

  if (
    session.isPlatformAdmin ||
    session.availableFacilities.length <= 1
  ) {
    return null;
  }

  const activeName =
    getActiveFacilityName(session) ?? "Select facility";

  const handleChange = (facilityId: string) => {
    if (facilityId === session.activeFacilityId || pending) return;

    startTransition(async () => {
      const res = await switchActiveFacility(facilityId);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      clearCart();
      toast.success("Switched facility");
      router.push(res.data.redirectTo);
      router.refresh();
    });
  };

  return (
    <div className={cn("relative min-w-0", className)}>
      <label htmlFor="facility-switcher" className="sr-only">
        Active facility
      </label>
      <div className="pointer-events-none absolute left-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1 text-primary">
        <Building2 className="size-4 shrink-0" aria-hidden />
      </div>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <select
        id="facility-switcher"
        value={session.activeFacilityId ?? ""}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        className={cn(
          "h-10 w-full min-w-[10rem] max-w-[14rem] appearance-none truncate rounded-lg border border-input bg-background pl-9 pr-8 text-sm font-medium shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          pending && "opacity-60",
        )}
      >
        {session.availableFacilities.map((f) => (
          <option key={f.facilityId} value={f.facilityId}>
            {f.facilityName} ({f.role})
          </option>
        ))}
      </select>
      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground lg:hidden">
        {activeName}
      </span>
    </div>
  );
}
