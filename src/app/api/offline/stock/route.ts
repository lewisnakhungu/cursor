/**
 * GET /api/offline/stock
 *
 * Returns all non-expired, in-stock batches for the active facility so the
 * POS can bulk-seed the offline stock cache on mount.
 *
 * Auth: valid session with an active facility.
 */

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { StockUnitCode } from "@/lib/stock-unit";

export async function GET(): Promise<NextResponse> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.activeFacilityId) {
    return NextResponse.json(
      { error: "No active facility — cannot load stock" },
      { status: 403 },
    );
  }

  const tenantId = session.activeFacilityId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const batches = await prisma.stockBatch.findMany({
      where: {
        tenantId,
        quantityOnHand: { gt: 0 },
        expiryDate: { gte: today },
      },
      orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
      select: {
        id: true,
        medicineId: true,
        batchNumber: true,
        quantityOnHand: true,
        expiryDate: true,
        retailSalePrice: true,
        stockUnit: true,
        unitsPerPack: true,
      },
    });

    return NextResponse.json(
      {
        batches: batches.map((batch) => ({
          batchId: batch.id,
          medicineId: batch.medicineId,
          batchNumber: batch.batchNumber,
          quantityOnHand: batch.quantityOnHand,
          expiryDate: batch.expiryDate.toISOString().slice(0, 10),
          retailSalePrice: batch.retailSalePrice
            ? Number.parseFloat(batch.retailSalePrice.toString())
            : null,
          stockUnit: batch.stockUnit as StockUnitCode,
          unitsPerPack: batch.unitsPerPack,
        })),
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to load stock" },
      { status: 500 },
    );
  }
}
