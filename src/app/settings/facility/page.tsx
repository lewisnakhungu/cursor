import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { FacilitySettingsPanel } from "@/components/settings/facility-settings";
import { getFacilitySettings } from "@/lib/actions/facility-settings";
import { Button } from "@/components/ui/button";

export default async function FacilitySettingsPage() {
  const res = await getFacilitySettings();
  if (!res.success) redirect("/settings/team");

  return (
    <AppShell
      title="Facility settings"
      subtitle="Owner-only — offline mode and operational risk"
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings/team">← Team & access</Link>
        </Button>
      </div>
      <FacilitySettingsPanel initial={res.data} />
    </AppShell>
  );
}
