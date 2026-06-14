import { AppShell } from "@/components/layout/app-shell";
import { ProcurementWorkspace } from "@/components/procurement/procurement-workspace";

export default function ProcurementPage() {
  return (
    <AppShell
      title="Procurement"
      subtitle="Generate reorder lists, edit quantities, and print requisitions"
    >
      <ProcurementWorkspace />
    </AppShell>
  );
}
