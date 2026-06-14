import { AppShell } from "@/components/layout/app-shell";
import { ReceiveWorkspace } from "@/components/receive/receive-workspace";

export default function ReceivePage() {
  return (
    <AppShell
      title="Receive inventory"
      subtitle="Count stock in tablets, boxes, etc. — qty and prices use the same unit"
    >
      <ReceiveWorkspace />
    </AppShell>
  );
}
