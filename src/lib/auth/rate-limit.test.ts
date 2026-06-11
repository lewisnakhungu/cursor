import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";

const KEY = "login:1.2.3.4:test@example.com";
const LIMIT = 5;
const WINDOW = 15 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  resetRateLimit(KEY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows up to the limit", () => {
    for (let i = 0; i < LIMIT; i++) {
      expect(checkRateLimit(KEY, LIMIT, WINDOW).allowed).toBe(true);
    }
  });

  it("blocks the attempt after the limit", () => {
    for (let i = 0; i < LIMIT; i++) checkRateLimit(KEY, LIMIT, WINDOW);
    const result = checkRateLimit(KEY, LIMIT, WINDOW);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("frees attempts as the window slides", () => {
    for (let i = 0; i < LIMIT; i++) checkRateLimit(KEY, LIMIT, WINDOW);
    expect(checkRateLimit(KEY, LIMIT, WINDOW).allowed).toBe(false);

    vi.advanceTimersByTime(WINDOW + 1000);
    expect(checkRateLimit(KEY, LIMIT, WINDOW).allowed).toBe(true);
  });

  it("isolates keys — one user cannot exhaust another's budget", () => {
    for (let i = 0; i < LIMIT; i++) checkRateLimit(KEY, LIMIT, WINDOW);
    expect(checkRateLimit("login:5.6.7.8:other@x.com", LIMIT, WINDOW).allowed).toBe(
      true,
    );
    resetRateLimit("login:5.6.7.8:other@x.com");
  });

  it("resetRateLimit clears the bucket on successful login", () => {
    for (let i = 0; i < LIMIT; i++) checkRateLimit(KEY, LIMIT, WINDOW);
    resetRateLimit(KEY);
    expect(checkRateLimit(KEY, LIMIT, WINDOW).allowed).toBe(true);
  });

  it("flooding new keys cannot evict an actively-blocked bucket", () => {
    for (let i = 0; i <= LIMIT; i++) checkRateLimit(KEY, LIMIT, WINDOW);
    expect(checkRateLimit(KEY, LIMIT, WINDOW).allowed).toBe(false);

    for (let i = 0; i < 11_000; i++) {
      checkRateLimit(`login:9.9.9.9:flood${i}@x.com`, LIMIT, WINDOW);
    }

    expect(checkRateLimit(KEY, LIMIT, WINDOW).allowed).toBe(false);

    for (let i = 0; i < 11_000; i++) {
      resetRateLimit(`login:9.9.9.9:flood${i}@x.com`);
    }
  });
});
