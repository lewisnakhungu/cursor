import { AppShell } from "@/components/layout/app-shell";
import { ReportsHub } from "@/components/reports/reports-hub";

export default function ReportsPage() {
  return (
    <AppShell
      title="Reports"
      subtitle="Printable weekly and monthly facility reports"
    >
      <ReportsHub />
    </AppShell>
  );
}
