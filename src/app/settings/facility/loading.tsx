import { AppShell } from "@/components/layout/app-shell";

export default function FacilitySettingsLoading() {
  return (
    <AppShell title="Facility settings" subtitle="Loading…">
      <div className="h-40 animate-pulse rounded-lg bg-muted/50" />
    </AppShell>
  );
}
