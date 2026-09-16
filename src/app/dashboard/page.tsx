import { AppShell } from "@/components/layout/app-shell";
import { DashboardHome } from "@/components/dashboard/dashboard-home";

export default function DashboardPage() {
  return (
    <AppShell
      title="AfyaStock"
      subtitle="Daily operations & pharmacy ledger"
    >
      <DashboardHome />
    </AppShell>
  );
}
