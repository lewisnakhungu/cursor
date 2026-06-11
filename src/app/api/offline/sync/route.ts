/**
 * POST /api/offline/sync
 *
 * Flushes pending offline operations (dispenses and receives) that were
 * queued while the device had no network.  Each operation is processed
 * independently; failures are reported per-item so the client can mark
 * individual entries as failed without losing the rest.
 *
 * Auth: valid session cookie with an active facility (same auth as server
 * actions; tenantId from the session is authoritative — not from the body).
 *
 * Request body:  SyncRequest  (see src/lib/offline/types.ts)
 * Response body: SyncResponse
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { dispenseMedicine } from "@/lib/actions/dispense";
import { receiveInventory } from "@/lib/actions/inventory";
import type { SyncRequest, SyncResponse, SyncResultItem } from "@/lib/offline/types";
import { MAX_OPERATION_AGE_MS } from "@/lib/offline/sync-queue";

const MAX_OPERATIONS_PER_REQUEST = 50;

export async function POST(req: NextRequest): Promise<NextResponse<SyncResponse | { error: string }>> {
  // -------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.activeFacilityId) {
    return NextResponse.json(
      { error: "No active facility — cannot sync" },
      { status: 403 },
    );
  }

  // -------------------------------------------------------------------
  // Parse body
  // -------------------------------------------------------------------
  let body: SyncRequest;
  try {
    body = (await req.json()) as SyncRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // The tenantId in the body must match the session — prevent cross-tenant sync.
  if (body.tenantId !== session.activeFacilityId) {
    return NextResponse.json(
      { error: "tenantId mismatch — please reload and try again" },
      { status: 403 },
    );
  }

  if (!Array.isArray(body.operations)) {
    return NextResponse.json(
      { error: "operations must be an array" },
      { status: 400 },
    );
  }

  const ops = body.operations.slice(0, MAX_OPERATIONS_PER_REQUEST);
  const results: SyncResultItem[] = [];

  // -------------------------------------------------------------------
  // Process each operation in sequence (serial to avoid FEFO races)
  // -------------------------------------------------------------------
  const staleCutoff = new Date(Date.now() - MAX_OPERATION_AGE_MS).toISOString();

  for (const op of ops) {
    const localId = op.localId!;

    // Abort stale operations before they touch the database.
    if (op.createdAt < staleCutoff) {
      results.push({
        localId,
        success: false,
        error: "Operation expired: queued more than 24 hours ago",
      });
      continue;
    }

    if (op.type === "DISPENSE") {
      const result = await dispenseMedicine(op.payload.cartItems);
      if (result.success) {
        results.push({ localId, success: true, saleId: result.data.saleId });
      } else {
        results.push({ localId, success: false, error: result.error });
      }
      continue;
    }

    if (op.type === "RECEIVE") {
      const result = await receiveInventory(op.payload);
      if (result.success) {
        results.push({ localId, success: true });
      } else {
        results.push({ localId, success: false, error: result.error });
      }
      continue;
    }

    // Unknown type — skip safely.
    results.push({
      localId,
      success: false,
      error: `Unknown operation type: ${(op as { type: string }).type}`,
    });
  }

  return NextResponse.json({ results });
}
