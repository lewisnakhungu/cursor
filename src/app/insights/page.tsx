import { AppShell } from "@/components/layout/app-shell";
import { InsightsDashboardClient } from "@/components/insights/insights-dashboard";

export default function InsightsPage() {
  return (
    <AppShell
      title="Stock insights"
      subtitle="Receive history, sell-through, and restock patterns"
    >
      <InsightsDashboardClient />
    </AppShell>
  );
}
