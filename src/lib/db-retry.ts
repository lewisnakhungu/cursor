/**
 * Retry for transient database transaction failures (audit M7):
 *  - P2034: write conflict / deadlock between concurrent transactions
 *  - P2028: transaction API timeout
 * These resolve themselves on retry once the competing transaction commits.
 */
const TRANSIENT_CODES = new Set(["P2034", "P2028"]);

export function isTransientDbError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    TRANSIENT_CODES.has(String((error as { code: unknown }).code))
  );
}

export async function withTransientRetry<T>(
  fn: () => Promise<T>,
  options?: { attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 100;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt === attempts - 1) {
        throw error;
      }
      const jitter = Math.random() * baseDelayMs;
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * 2 ** attempt + jitter),
      );
    }
  }
  throw lastError;
}
