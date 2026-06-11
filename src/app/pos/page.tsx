import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { PosTerminal } from "@/components/pos/pos-terminal";

export default async function PosPage() {
  const session = await getSession();
  if (!session?.activeFacilityId) redirect("/login");

  return (
    <AppShell
      wide
      title="Dispense (POS)"
      subtitle="Quantities use each batch's counting unit"
    >
      <PosTerminal tenantId={session.activeFacilityId} />
    </AppShell>
  );
}
