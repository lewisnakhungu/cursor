import { describe, expect, it } from "vitest";
import { isTransientDbError, withTransientRetry } from "@/lib/db-retry";

function transientError(code: string) {
  return Object.assign(new Error(`prisma ${code}`), { code });
}

describe("isTransientDbError", () => {
  it("recognizes write conflicts and tx timeouts", () => {
    expect(isTransientDbError(transientError("P2034"))).toBe(true);
    expect(isTransientDbError(transientError("P2028"))).toBe(true);
  });

  it("rejects other errors", () => {
    expect(isTransientDbError(new Error("boom"))).toBe(false);
    expect(isTransientDbError(transientError("P2002"))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
  });
});

describe("withTransientRetry", () => {
  it("returns the result on first success", async () => {
    let calls = 0;
    const result = await withTransientRetry(async () => {
      calls += 1;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries transient failures and eventually succeeds", async () => {
    let calls = 0;
    const result = await withTransientRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw transientError("P2034");
        return "recovered";
      },
      { attempts: 3, baseDelayMs: 1 },
    );
    expect(result).toBe("recovered");
    expect(calls).toBe(3);
  });

  it("gives up after the attempt budget", async () => {
    let calls = 0;
    await expect(
      withTransientRetry(
        async () => {
          calls += 1;
          throw transientError("P2034");
        },
        { attempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toMatchObject({ code: "P2034" });
    expect(calls).toBe(3);
  });

  it("does not retry non-transient errors", async () => {
    let calls = 0;
    await expect(
      withTransientRetry(
        async () => {
          calls += 1;
          throw new Error("validation failed");
        },
        { attempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow("validation failed");
    expect(calls).toBe(1);
  });
});
