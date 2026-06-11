/**
 * In-memory sliding-window rate limiter for auth endpoints.
 *
 * Sufficient for a single-region deployment at pilot scale. Serverless
 * instances each keep their own window, so the effective global limit is
 * (limit × concurrent instances) — still a meaningful brute-force barrier.
 * Swap for Upstash/Redis when scaling out.
 */

type WindowEntry = {
  timestamps: number[];
};

const buckets = new Map<string, WindowEntry>();

const MAX_BUCKETS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = buckets.get(key);
  if (!entry) {
    if (buckets.size >= MAX_BUCKETS) {
      // Evict expired buckets; never evict actively-blocked ones, or an
      // attacker could flood keys to evict their own block and retry.
      buckets.forEach((v, k) => {
        if (v.timestamps.every((t) => t < cutoff)) buckets.delete(k);
      });
      let evicted = 0;
      buckets.forEach((v, k) => {
        if (buckets.size - evicted < MAX_BUCKETS) return;
        const active = v.timestamps.filter((t) => t >= cutoff);
        if (active.length < limit) {
          buckets.delete(k);
          evicted += 1;
        }
      });
      if (buckets.size >= MAX_BUCKETS) {
        // Map saturated with blocked keys (attack in progress): fail closed.
        return { allowed: false, remaining: 0, retryAfterMs: windowMs };
      }
    }
    entry = { timestamps: [] };
    buckets.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => t >= cutoff);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: oldest + windowMs - now,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    retryAfterMs: 0,
  };
}

/** Clear a key after success so legitimate users aren't penalized. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
