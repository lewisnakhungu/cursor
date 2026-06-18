import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { FacilitySettingsPanel } from "@/components/settings/facility-settings";
import { getFacilitySettings } from "@/lib/actions/facility-settings";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function FacilitySettingsPage() {
  const res = await getFacilitySettings();
  if (!res.success) redirect("/settings/team");

  return (
    <AppShell
      title="Facility settings"
      subtitle="Owner-only — offline mode and operational risk"
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/settings/team"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Team & access
        </Link>
      </div>
      <FacilitySettingsPanel initial={res.data} />
    </AppShell>
  );
}
