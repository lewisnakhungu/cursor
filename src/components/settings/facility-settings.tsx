"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  getFacilitySettings,
  setOfflineModeEnabled,
  type FacilitySettingsView,
} from "@/lib/actions/facility-settings";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function FacilitySettingsPanel({
  initial,
}: {
  initial: FacilitySettingsView;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSettings(initial);
  }, [initial]);

  const toggle = () => {
    const next = !settings.offlineModeEnabled;
    startTransition(async () => {
      const res = await setOfflineModeEnabled(next);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setSettings((s) => ({ ...s, offlineModeEnabled: res.data.offlineModeEnabled }));
      toast.success(
        res.data.offlineModeEnabled
          ? "Offline mode enabled for this facility"
          : "Offline mode disabled",
      );
      router.refresh();
    });
  };

  const reload = () => {
    startTransition(async () => {
      const res = await getFacilitySettings();
      if (res.success) setSettings(res.data);
    });
  };

  return (
    <div className="space-y-6">
      <section className="pharmacy-panel max-w-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <ShieldAlert className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold">Offline dispense (PWA)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              For {settings.facilityName}. Only the facility owner can change
              this setting.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 p-4 text-sm text-amber-950">
          <p className="font-medium">Risk notice</p>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-amber-900/90">
            <li>
              Offline sales are stored on this device until internet returns —
              devices can be lost, shared, or tampered with.
            </li>
            <li>
              Cached stock may not match the server if others dispense online
              at the same time.
            </li>
            <li>
              Staff should sync pending sales promptly when connectivity is
              restored.
            </li>
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">
              {settings.offlineModeEnabled ? "Enabled" : "Disabled"}
            </p>
            <p className="text-sm text-muted-foreground">
              {settings.offlineModeEnabled
                ? "POS preloads catalog/stock and allows dispense without internet."
                : "POS requires internet for all dispense actions."}
            </p>
          </div>
          <Button
            type="button"
            variant={settings.offlineModeEnabled ? "outline" : "default"}
            disabled={pending}
            onClick={toggle}
          >
            {settings.offlineModeEnabled ? "Disable offline mode" : "Enable offline mode"}
          </Button>
        </div>
      </section>

      <section className="max-w-2xl text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Status indicator (POS)</p>
        <ul className="mt-2 space-y-2">
          <li className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.8)]" />
            Green — online
          </li>
          <li className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-sky-400 shadow-[0_0_8px_2px_rgba(56,189,248,0.8)]" />
            Blue — offline with cache loaded
          </li>
          <li className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.8)]" />
            Red — offline without cache (or offline mode disabled)
          </li>
        </ul>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-4"
          disabled={pending}
          onClick={reload}
        >
          Refresh settings
        </Button>
      </section>
    </div>
  );
}
