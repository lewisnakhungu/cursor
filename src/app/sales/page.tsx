import { AppShell } from "@/components/layout/app-shell";
import { SalesDashboardClient } from "@/components/sales/sales-dashboard";

export default function SalesPage() {
  return (
    <AppShell
      title="Sales & audit"
      subtitle="Today's revenue, top movers, and dispense corrections"
    >
      <SalesDashboardClient />
    </AppShell>
  );
}
