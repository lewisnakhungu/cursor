import { describe, expect, it } from "vitest";
import {
  canAccessNav,
  canAccessPath,
  hasPermission,
  permissionsForRole,
} from "@/lib/auth/permissions";
import type { SessionPayload } from "@/lib/auth/session-types";

function makeSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    userId: "u1",
    email: "user@test.local",
    name: null,
    isPlatformAdmin: false,
    activeFacilityId: "t1",
    activeRole: "OWNER",
    availableFacilities: [
      { facilityId: "t1", facilityName: "Facility One", role: "OWNER" },
    ],
    sessionVersion: 0,
    ...overrides,
  };
}

describe("permissionsForRole", () => {
  it("OWNER has team management", () => {
    expect(permissionsForRole("OWNER").has("facility.manage_team")).toBe(true);
  });

  it("DEPUTY cannot manage team", () => {
    expect(permissionsForRole("DEPUTY").has("facility.manage_team")).toBe(false);
  });

  it("DISPENSER is restricted to dashboard + POS", () => {
    const perms = permissionsForRole("DISPENSER");
    expect(perms.has("dispense.sale")).toBe(true);
    expect(perms.has("receive.stock")).toBe(false);
    expect(perms.has("reports.view")).toBe(false);
  });

  it("null role yields no permissions", () => {
    expect(permissionsForRole(null).size).toBe(0);
  });
});

describe("hasPermission", () => {
  it("platform admin only has platform.admin", () => {
    const admin = makeSession({
      isPlatformAdmin: true,
      activeFacilityId: null,
      activeRole: null,
      availableFacilities: [],
    });
    expect(hasPermission(admin, "platform.admin")).toBe(true);
    expect(hasPermission(admin, "dispense.sale")).toBe(false);
  });

  it("facility role permissions follow activeRole", () => {
    const dispenser = makeSession({ activeRole: "DISPENSER" });
    expect(hasPermission(dispenser, "dispense.sale")).toBe(true);
    expect(hasPermission(dispenser, "facility.manage_team")).toBe(false);
  });
});

describe("canAccessNav", () => {
  it("dispenser only sees dashboard and pos", () => {
    const dispenser = makeSession({ activeRole: "DISPENSER" });
    expect(canAccessNav(dispenser, "pos")).toBe(true);
    expect(canAccessNav(dispenser, "dashboard")).toBe(true);
    expect(canAccessNav(dispenser, "receive")).toBe(false);
    expect(canAccessNav(dispenser, "team")).toBe(false);
    expect(canAccessNav(dispenser, "admin")).toBe(false);
  });

  it("owner sees everything except admin", () => {
    const owner = makeSession();
    expect(canAccessNav(owner, "team")).toBe(true);
    expect(canAccessNav(owner, "reports")).toBe(true);
    expect(canAccessNav(owner, "admin")).toBe(false);
  });
});

describe("canAccessPath", () => {
  it("platform admin is confined to /admin", () => {
    const admin = makeSession({
      isPlatformAdmin: true,
      activeFacilityId: null,
      activeRole: null,
      availableFacilities: [],
    });
    expect(canAccessPath(admin, "/admin")).toBe(true);
    expect(canAccessPath(admin, "/pos")).toBe(false);
    expect(canAccessPath(admin, "/dashboard")).toBe(false);
  });

  it("dispenser blocked from /receive and /settings/team", () => {
    const dispenser = makeSession({ activeRole: "DISPENSER" });
    expect(canAccessPath(dispenser, "/pos")).toBe(true);
    expect(canAccessPath(dispenser, "/receive")).toBe(false);
    expect(canAccessPath(dispenser, "/settings/team")).toBe(false);
  });

  it("owner can reach the dashboard route", () => {
    expect(canAccessPath(makeSession(), "/dashboard")).toBe(true);
  });

  it("denies unknown routes by default (audit L4)", () => {
    expect(canAccessPath(makeSession(), "/some-new-route")).toBe(false);
    expect(
      canAccessPath(makeSession({ activeRole: "DISPENSER" }), "/internal"),
    ).toBe(false);
  });

  it("maps bare /settings to the team permission", () => {
    expect(canAccessPath(makeSession(), "/settings")).toBe(true);
    expect(
      canAccessPath(makeSession({ activeRole: "DISPENSER" }), "/settings"),
    ).toBe(false);
  });
});
