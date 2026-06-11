/**
 * GET /api/offline/catalog
 *
 * Returns the full KEML medicine catalog in a format optimised for
 * IndexedDB storage.  Called once on first POS load and then every
 * 24 hours via a SW Background Sync tag.
 *
 * Auth: valid session cookie required (any role).
 * Response: { medicines: OfflineMedicine[], generatedAt: string }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import type { OfflineMedicine } from "@/lib/offline/types";

// Shared catalog is read-only and identical for every user — cache at the
// CDN / Next.js layer for 60 seconds, stale-while-revalidate 24 hours.
export const revalidate = 60;

function buildSearchKey(
  genericName: string,
  aliases: string[],
): string {
  const parts = [genericName, ...aliases]
    .map((s) =>
      s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9+]+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  return parts.join(" ");
}

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const medicines = await prisma.medicine.findMany({
      where: { isStub: false },
      include: {
        aliases: { select: { name: true }, orderBy: { name: "asc" } },
      },
      orderBy: [{ genericName: "asc" }, { dosageForm: "asc" }],
    });

    const payload: OfflineMedicine[] = medicines.map((m) => {
      const aliasNames = m.aliases.map((a) => a.name);
      return {
        id: m.id,
        genericName: m.genericName,
        dosageForm: m.dosageForm,
        strength: m.strength,
        levelOfUse: m.levelOfUse,
        aliases: aliasNames,
        searchKey: buildSearchKey(m.genericName, aliasNames),
      };
    });

    return NextResponse.json(
      { medicines: payload, generatedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to load catalog" },
      { status: 500 },
    );
  }
}
