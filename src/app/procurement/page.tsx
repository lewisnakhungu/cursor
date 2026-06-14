import { AppShell } from "@/components/layout/app-shell";
import { ProcurementWorkspace } from "@/components/procurement/procurement-workspace";

export default function ProcurementPage() {
  return (
    <AppShell
      title="Procurement"
      subtitle="Generate reorder lists, import partner files, and print requisitions"
    >
      <ProcurementWorkspace />
    </AppShell>
  );
}
