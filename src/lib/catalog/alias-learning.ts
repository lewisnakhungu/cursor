import {
  AliasProposalStatus,
  AliasSource,
  AliasStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type CatalogAliasLearningInput = {
  rawName: string;
  medicineId: string;
  /** True when bulk matcher auto-selected this row with HIGH confidence */
  autoMatchedHigh?: boolean;
};

export type AliasLearningResult = {
  learned: number;
  proposals: number;
  skipped: number;
};

function normalizeAliasName(rawName: string): string | null {
  const name = rawName.trim();
  if (name.length < 3) return null;
  return name;
}

/**
 * Teaches supplier/product labels from successful bulk receives into the global
 * alias index. Conflicts (same label → different medicines) go to review queue.
 */
export async function applyCatalogAliasLearnings(
  learnings: CatalogAliasLearningInput[],
  ctx: { tenantId: string; userId: string },
): Promise<AliasLearningResult> {
  let learned = 0;
  let proposals = 0;
  let skipped = 0;

  for (const entry of learnings) {
    const name = normalizeAliasName(entry.rawName);
    if (!name) {
      skipped += 1;
      continue;
    }

    if (entry.autoMatchedHigh) {
      skipped += 1;
      continue;
    }

    const medicine = await prisma.medicine.findUnique({
      where: { id: entry.medicineId },
      select: { id: true, isStub: true, genericName: true },
    });
    if (!medicine || medicine.isStub) {
      skipped += 1;
      continue;
    }

    const exactOnTarget = await prisma.medicineAlias.findUnique({
      where: {
        medicineId_name: { medicineId: entry.medicineId, name },
      },
    });
    if (exactOnTarget?.status === AliasStatus.ACTIVE) {
      skipped += 1;
      continue;
    }

    const conflict = await prisma.medicineAlias.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        medicineId: { not: entry.medicineId },
        status: AliasStatus.ACTIVE,
      },
      select: { id: true, medicineId: true },
    });

    if (conflict) {
      const existingProposal = await prisma.catalogAliasProposal.findFirst({
        where: {
          rawName: { equals: name, mode: "insensitive" },
          medicineId: entry.medicineId,
          tenantId: ctx.tenantId,
          status: AliasProposalStatus.PENDING,
        },
      });
      if (!existingProposal) {
        await prisma.catalogAliasProposal.create({
          data: {
            rawName: name,
            medicineId: entry.medicineId,
            tenantId: ctx.tenantId,
            proposedById: ctx.userId,
            status: AliasProposalStatus.PENDING,
            note: `Conflicts with alias on another catalog row (${conflict.medicineId})`,
          },
        });
      }
      proposals += 1;
      continue;
    }

    if (exactOnTarget) {
      await prisma.medicineAlias.update({
        where: { id: exactOnTarget.id },
        data: {
          status: AliasStatus.ACTIVE,
          source: AliasSource.IMPORT_LEARNED,
          tenantId: ctx.tenantId,
          learnedAt: new Date(),
        },
      });
    } else {
      await prisma.medicineAlias.create({
        data: {
          name,
          medicineId: entry.medicineId,
          source: AliasSource.IMPORT_LEARNED,
          status: AliasStatus.ACTIVE,
          tenantId: ctx.tenantId,
          learnedAt: new Date(),
        },
      });
    }

    learned += 1;
  }

  return { learned, proposals, skipped };
}

export async function approveCatalogAliasProposal(
  proposalId: string,
  reviewerId: string,
): Promise<void> {
  const proposal = await prisma.catalogAliasProposal.findUnique({
    where: { id: proposalId },
  });
  if (!proposal || proposal.status !== AliasProposalStatus.PENDING) {
    throw new Error("Proposal not found or already reviewed");
  }

  await prisma.$transaction(async (tx) => {
    await tx.medicineAlias.upsert({
      where: {
        medicineId_name: {
          medicineId: proposal.medicineId,
          name: proposal.rawName.trim(),
        },
      },
      create: {
        name: proposal.rawName.trim(),
        medicineId: proposal.medicineId,
        source: AliasSource.USER_CONFIRMED,
        status: AliasStatus.ACTIVE,
        tenantId: proposal.tenantId,
        learnedAt: new Date(),
      },
      update: {
        status: AliasStatus.ACTIVE,
        source: AliasSource.USER_CONFIRMED,
      },
    });

    await tx.catalogAliasProposal.update({
      where: { id: proposalId },
      data: {
        status: AliasProposalStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
    });
  });
}

export async function rejectCatalogAliasProposal(
  proposalId: string,
  reviewerId: string,
  note?: string,
): Promise<void> {
  await prisma.catalogAliasProposal.updateMany({
    where: { id: proposalId, status: AliasProposalStatus.PENDING },
    data: {
      status: AliasProposalStatus.REJECTED,
      reviewedAt: new Date(),
      reviewedById: reviewerId,
      note: note?.trim() || undefined,
    },
  });
}

export async function revokeCatalogAlias(
  aliasId: string,
): Promise<void> {
  await prisma.medicineAlias.update({
    where: { id: aliasId },
    data: { status: AliasStatus.REVOKED },
  });
}
