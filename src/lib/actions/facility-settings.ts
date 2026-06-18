"use server";

import { prisma } from "@/lib/prisma";
import { requireFacilityOwner } from "@/lib/auth/guards";
import { requireSession } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/types";
import { runAction } from "@/lib/actions/utils";

export type FacilitySettingsView = {
  facilityName: string;
  offlineModeEnabled: boolean;
};

export async function getFacilitySettings(): Promise<
  ActionResult<FacilitySettingsView>
> {
  const session = await requireFacilityOwner();
  return runAction("getFacilitySettings", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: session.activeFacilityId! },
      select: { name: true, offlineModeEnabled: true },
    });
    return {
      facilityName: tenant.name,
      offlineModeEnabled: tenant.offlineModeEnabled,
    };
  });
}

export async function setOfflineModeEnabled(
  enabled: boolean,
): Promise<ActionResult<{ offlineModeEnabled: boolean }>> {
  const session = await requireFacilityOwner();
  return runAction("setOfflineModeEnabled", async () => {
    const tenant = await prisma.tenant.update({
      where: { id: session.activeFacilityId! },
      data: { offlineModeEnabled: enabled },
      select: { offlineModeEnabled: true },
    });
    return { offlineModeEnabled: tenant.offlineModeEnabled };
  });
}

/** Any signed-in facility user — used by POS and PWA bootstrap. */
export async function isOfflineModeEnabledForSession(): Promise<boolean> {
  const session = await requireSession();
  if (!session?.activeFacilityId || session.isPlatformAdmin) return false;

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.activeFacilityId },
    select: { offlineModeEnabled: true },
  });
  return tenant?.offlineModeEnabled ?? false;
}
