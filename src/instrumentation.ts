import * as Sentry from "@sentry/nextjs";

const sentryInit = {
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  debug: false,
} as const;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      ...sentryInit,
      dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
      enabled: Boolean(
        process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
      ),
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      ...sentryInit,
      dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
      enabled: Boolean(
        process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
      ),
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
