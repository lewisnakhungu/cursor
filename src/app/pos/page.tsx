import { AppShell } from "@/components/layout/app-shell";
import { PosTerminal } from "@/components/pos/pos-terminal";

export default function PosPage() {
  return (
    <AppShell
      wide
      title="Dispense (POS)"
      subtitle="Quantities use each batch's counting unit"
    >
      <PosTerminal />
    </AppShell>
  );
}
