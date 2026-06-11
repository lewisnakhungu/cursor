import { describe, expect, it } from "vitest";
import { validatePasswordPolicy } from "@/lib/auth/password-policy";

describe("validatePasswordPolicy", () => {
  it("rejects passwords under 8 characters", () => {
    expect(validatePasswordPolicy("abc1")).toMatch(/at least 8/);
    expect(validatePasswordPolicy("")).toMatch(/at least 8/);
  });

  it("rejects passwords without a letter", () => {
    expect(validatePasswordPolicy("12345678")).toMatch(/letter/);
  });

  it("rejects passwords without a number", () => {
    expect(validatePasswordPolicy("longenough")).toMatch(/number/);
  });

  it("accepts passwords with 8+ chars, a letter, and a number", () => {
    expect(validatePasswordPolicy("pharmacy1")).toBeNull();
    expect(validatePasswordPolicy("Duka2026!")).toBeNull();
  });
});
