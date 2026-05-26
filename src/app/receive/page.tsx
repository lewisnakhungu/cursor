import { AppShell } from "@/components/layout/app-shell";
import { ReceiveIntakeForm } from "@/components/receive/receive-intake-form";

export default function ReceivePage() {
  return (
    <AppShell
      title="Receive inventory"
      subtitle="Count stock in tablets, boxes, etc. — qty and prices use the same unit"
    >
      <ReceiveIntakeForm />
    </AppShell>
  );
}
