"use server";

import { AliasProposalStatus, AliasSource, AliasStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  approveCatalogAliasProposal,
  rejectCatalogAliasProposal,
  revokeCatalogAlias,
} from "@/lib/catalog/alias-learning";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { runAction } from "@/lib/actions/utils";
import type { ActionResult } from "@/lib/types";

export type CatalogAdminStats = {
  searchableMedicines: number;
  nonPharmItems: number;
  activeAliases: number;
  aliasesBySource: Record<string, number>;
  pendingProposals: number;
  recentlyLearned: number;
};

export type CatalogAliasProposalView = {
  id: string;
  rawName: string;
  medicineId: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  tenantId: string;
  note: string | null;
  createdAt: string;
};

export type LearnedAliasView = {
  id: string;
  name: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  source: string;
  tenantId: string | null;
  learnedAt: string | null;
};

export async function getCatalogAdminStats(): Promise<
  ActionResult<CatalogAdminStats>
> {
  await requirePlatformAdmin();
  return runAction("getCatalogAdminStats", async () => {
    const [
      searchableMedicines,
      nonPharmItems,
      activeAliases,
      aliasGroups,
      pendingProposals,
      recentlyLearned,
    ] = await Promise.all([
      prisma.medicine.count({ where: { isStub: false } }),
      prisma.medicine.count({
        where: { isStub: false, itemType: "NON_PHARM" },
      }),
      prisma.medicineAlias.count({ where: { status: AliasStatus.ACTIVE } }),
      prisma.medicineAlias.groupBy({
        by: ["source"],
        where: { status: AliasStatus.ACTIVE },
        _count: { id: true },
      }),
      prisma.catalogAliasProposal.count({
        where: { status: AliasProposalStatus.PENDING },
      }),
      prisma.medicineAlias.count({
        where: {
          source: AliasSource.IMPORT_LEARNED,
          status: AliasStatus.ACTIVE,
          learnedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const aliasesBySource: Record<string, number> = {};
    for (const row of aliasGroups) {
      aliasesBySource[row.source] = row._count.id;
    }

    return {
      searchableMedicines,
      nonPharmItems,
      activeAliases,
      aliasesBySource,
      pendingProposals,
      recentlyLearned,
    };
  });
}

export async function listCatalogAliasProposals(): Promise<
  ActionResult<CatalogAliasProposalView[]>
> {
  await requirePlatformAdmin();
  return runAction("listCatalogAliasProposals", async () => {
    const rows = await prisma.catalogAliasProposal.findMany({
      where: { status: AliasProposalStatus.PENDING },
      include: {
        medicine: {
          select: { genericName: true, dosageForm: true, strength: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      rawName: row.rawName,
      medicineId: row.medicineId,
      genericName: row.medicine.genericName,
      dosageForm: row.medicine.dosageForm,
      strength: row.medicine.strength,
      tenantId: row.tenantId,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    }));
  });
}

export async function listRecentLearnedAliases(): Promise<
  ActionResult<LearnedAliasView[]>
> {
  await requirePlatformAdmin();
  return runAction("listRecentLearnedAliases", async () => {
    const rows = await prisma.medicineAlias.findMany({
      where: {
        status: AliasStatus.ACTIVE,
        source: { in: [AliasSource.IMPORT_LEARNED, AliasSource.USER_CONFIRMED] },
      },
      include: {
        medicine: {
          select: { genericName: true, dosageForm: true, strength: true },
        },
      },
      orderBy: [{ learnedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      genericName: row.medicine.genericName,
      dosageForm: row.medicine.dosageForm,
      strength: row.medicine.strength,
      source: row.source,
      tenantId: row.tenantId,
      learnedAt: row.learnedAt?.toISOString() ?? null,
    }));
  });
}

export async function approveCatalogProposal(
  proposalId: string,
): Promise<ActionResult<{ ok: true }>> {
  const session = await requirePlatformAdmin();
  return runAction("approveCatalogProposal", async () => {
    await approveCatalogAliasProposal(proposalId, session.userId);
    return { ok: true as const };
  });
}

export async function rejectCatalogProposal(
  proposalId: string,
  note?: string,
): Promise<ActionResult<{ ok: true }>> {
  const session = await requirePlatformAdmin();
  return runAction("rejectCatalogProposal", async () => {
    await rejectCatalogAliasProposal(proposalId, session.userId, note);
    return { ok: true as const };
  });
}

export async function revokeLearnedAlias(
  aliasId: string,
): Promise<ActionResult<{ ok: true }>> {
  await requirePlatformAdmin();
  return runAction("revokeLearnedAlias", async () => {
    await revokeCatalogAlias(aliasId);
    return { ok: true as const };
  });
}
