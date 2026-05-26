import { AppShell } from "@/components/layout/app-shell";
import { TeamSettings } from "@/components/settings/team-settings";

export default function TeamSettingsPage() {
  return (
    <AppShell
      title="Team & access"
      subtitle="Deputy and dispenser accounts for your facility"
    >
      <TeamSettings />
    </AppShell>
  );
}
