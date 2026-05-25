import * as Sentry from "@sentry/nextjs";
import { AppError, getErrorMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

export async function runAction<T>(
  actionName: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { action: actionName } });

    if (error instanceof AppError) {
      return { success: false, error: error.message, code: error.code };
    }

    return { success: false, error: getErrorMessage(error), code: "INTERNAL" };
  }
}
