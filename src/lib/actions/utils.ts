import * as Sentry from "@sentry/nextjs";
import { AppError, getErrorMessage } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

export async function runAction<T>(
  actionName: string,
  fn: () => Promise<T>,
  context?: { tenantId?: string },
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error: unknown) {
    if (error instanceof AppError) {
      // Expected business conditions (validation, auth, stock) are not
      // exceptions — keep Sentry signal clean.
      return { success: false, error: error.message, code: error.code };
    }

    Sentry.captureException(error, {
      tags: {
        action: actionName,
        ...(context?.tenantId ? { tenantId: context.tenantId } : {}),
      },
    });

    return { success: false, error: getErrorMessage(error), code: "INTERNAL" };
  }
}
