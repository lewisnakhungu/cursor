import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { PosTerminal } from "@/components/pos/pos-terminal";
import { prisma } from "@/lib/prisma";

export default async function PosPage() {
  const session = await getSession();
  if (!session?.activeFacilityId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.activeFacilityId },
    select: { offlineModeEnabled: true },
  });

  return (
    <AppShell
      wide
      title="Dispense (POS)"
      subtitle="Quantities use each batch's counting unit"
    >
      <PosTerminal
        tenantId={session.activeFacilityId}
        offlineModeEnabled={tenant?.offlineModeEnabled ?? false}
      />
    </AppShell>
  );
}
