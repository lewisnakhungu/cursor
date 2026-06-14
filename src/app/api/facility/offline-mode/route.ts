import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/** GET /api/facility/offline-mode — whether offline PWA is enabled for this facility. */
export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.activeFacilityId || session.isPlatformAdmin) {
    return NextResponse.json({ enabled: false });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.activeFacilityId },
    select: { offlineModeEnabled: true },
  });

  return NextResponse.json({ enabled: tenant?.offlineModeEnabled ?? false });
}
