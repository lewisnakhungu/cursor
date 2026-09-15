import { AppShell } from "@/components/layout/app-shell";
import { BankingHub } from "@/components/dashboard/banking-hub";

export default function DashboardPage() {
  return (
    <AppShell
      title="Chemist Operations Hub"
      subtitle="Point of sale, stock tracking, and pharmacy ledger"
    >
      <BankingHub />
    </AppShell>
  );
}
