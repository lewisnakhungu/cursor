import { describe, expect, it } from "vitest";
import {
  allocateFefo,
  injectTenantIntoData,
  mergeTenantUniqueWhere,
  mergeTenantWhere,
  scopeQueryArgs,
} from "@/lib/tenant-scope";

const TENANT = "facility-a";

describe("mergeTenantWhere", () => {
  it("adds tenantId when where is undefined", () => {
    expect(mergeTenantWhere(undefined, TENANT)).toEqual({ tenantId: TENANT });
  });

  it("wraps existing filters in AND so callers cannot override tenantId", () => {
    const merged = mergeTenantWhere({ tenantId: "facility-b" }, TENANT);
    expect(merged).toEqual({
      AND: [{ tenantId: "facility-b" }, { tenantId: TENANT }],
    });
  });
});

describe("mergeTenantUniqueWhere", () => {
  it("keeps the unique field at top level (Prisma WhereUniqueInput)", () => {
    const merged = mergeTenantUniqueWhere({ id: "batch-1" }, TENANT);
    expect(merged).toEqual({ id: "batch-1", tenantId: TENANT });
  });

  it("overrides a caller-supplied tenantId — spoofing is impossible", () => {
    const merged = mergeTenantUniqueWhere(
      { id: "batch-1", tenantId: "facility-b" },
      TENANT,
    );
    expect(merged.tenantId).toBe(TENANT);
  });
});

describe("injectTenantIntoData", () => {
  it("stamps tenantId on single create data", () => {
    expect(injectTenantIntoData({ totalAmount: 0 }, TENANT)).toEqual({
      totalAmount: 0,
      tenantId: TENANT,
    });
  });

  it("stamps tenantId on every row of createMany data", () => {
    const rows = injectTenantIntoData([{ a: 1 }, { a: 2 }], TENANT);
    expect(rows).toEqual([
      { a: 1, tenantId: TENANT },
      { a: 2, tenantId: TENANT },
    ]);
  });

  it("overrides caller-supplied tenantId on create", () => {
    const data = injectTenantIntoData(
      { tenantId: "facility-b", totalAmount: 5 },
      TENANT,
    ) as Record<string, unknown>;
    expect(data.tenantId).toBe(TENANT);
  });
});

describe("scopeQueryArgs — tenant isolation per operation", () => {
  it("scopes findMany with AND filter", () => {
    const args = scopeQueryArgs(
      { operation: "findMany", args: { where: { quantityOnHand: { gt: 0 } } } },
      TENANT,
    );
    expect(args.where).toEqual({
      AND: [{ quantityOnHand: { gt: 0 } }, { tenantId: TENANT }],
    });
  });

  it("scopes findUnique via extended where-unique (audit H2 regression)", () => {
    const args = scopeQueryArgs(
      { operation: "findUnique", args: { where: { id: "sale-1" } } },
      TENANT,
    );
    expect(args.where).toEqual({ id: "sale-1", tenantId: TENANT });
  });

  it("scopes findUniqueOrThrow the same way", () => {
    const args = scopeQueryArgs(
      { operation: "findUniqueOrThrow", args: { where: { id: "x" } } },
      TENANT,
    );
    expect(args.where).toEqual({ id: "x", tenantId: TENANT });
  });

  it("scopes update / delete unique ops", () => {
    for (const operation of ["update", "delete"]) {
      const args = scopeQueryArgs(
        { operation, args: { where: { id: "row-1" } } },
        TENANT,
      );
      expect(args.where).toEqual({ id: "row-1", tenantId: TENANT });
    }
  });

  it("injects tenantId into create data", () => {
    const args = scopeQueryArgs(
      { operation: "create", args: { data: { totalAmount: 10 } } },
      TENANT,
    );
    expect(args.data).toEqual({ totalAmount: 10, tenantId: TENANT });
  });

  it("scopes upsert where, create, and update branches", () => {
    const args = scopeQueryArgs(
      {
        operation: "upsert",
        args: {
          where: { id: "row-1" },
          create: { name: "x" },
          update: { name: "y" },
        },
      },
      TENANT,
    );
    expect(args.where).toEqual({ id: "row-1", tenantId: TENANT });
    expect(args.create).toEqual({ name: "x", tenantId: TENANT });
    expect(args.update).toEqual({ name: "y", tenantId: TENANT });
  });

  it("leaves unknown/raw operations untouched", () => {
    const args = scopeQueryArgs(
      { operation: "$queryRaw", args: { someArg: 1 } },
      TENANT,
    );
    expect(args).toEqual({ someArg: 1 });
  });
});

describe("allocateFefo — dispense allocation", () => {
  const batches = [
    { id: "expires-first", quantityOnHand: 10 },
    { id: "expires-second", quantityOnHand: 20 },
    { id: "expires-third", quantityOnHand: 30 },
  ];

  it("takes everything from the nearest-expiry batch first", () => {
    const { allocations, shortfall } = allocateFefo(batches, 8);
    expect(allocations).toEqual([{ batchId: "expires-first", take: 8 }]);
    expect(shortfall).toBe(0);
  });

  it("spills into later batches in order", () => {
    const { allocations, shortfall } = allocateFefo(batches, 25);
    expect(allocations).toEqual([
      { batchId: "expires-first", take: 10 },
      { batchId: "expires-second", take: 15 },
    ]);
    expect(shortfall).toBe(0);
  });

  it("drains all batches and reports shortfall when stock is insufficient", () => {
    const { allocations, shortfall } = allocateFefo(batches, 100);
    expect(allocations.reduce((s, a) => s + a.take, 0)).toBe(60);
    expect(shortfall).toBe(40);
  });

  it("skips empty batches without allocating zero", () => {
    const { allocations } = allocateFefo(
      [
        { id: "empty", quantityOnHand: 0 },
        { id: "full", quantityOnHand: 5 },
      ],
      3,
    );
    expect(allocations).toEqual([{ batchId: "full", take: 3 }]);
  });

  it("returns full shortfall when no stock at all", () => {
    const { allocations, shortfall } = allocateFefo([], 5);
    expect(allocations).toEqual([]);
    expect(shortfall).toBe(5);
  });
});
