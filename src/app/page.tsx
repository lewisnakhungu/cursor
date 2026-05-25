import { AppShell } from "@/components/layout/app-shell";
import { StockDashboard } from "@/components/dashboard/stock-dashboard";

export default function HomePage() {
  return (
    <AppShell
      title="Operations dashboard"
      subtitle="Real-time expiry risk, low stock, and FEFO pull order"
    >
      <StockDashboard />
    </AppShell>
  );
}
