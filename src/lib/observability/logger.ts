import { env } from "@/lib/env";

/**
 * Minimal structured logging + error capture.
 *
 * Logs are emitted as single-line JSON so a log drain (Datadog, Logtail, etc.)
 * or Sentry can ingest them with fields intact. `captureException` is the one
 * place server errors funnel through; wiring a real error tracker later means
 * installing `@sentry/nextjs` and forwarding inside `captureException` — the
 * SENTRY_DSN gate is already here.
 */

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};

/** Funnel for unexpected errors. Always logs; forwards to Sentry if configured. */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  emit("error", err.message, { name: err.name, stack: err.stack, ...context });

  if (env.sentryDsn()) {
    // Integration point: with @sentry/nextjs installed, forward here, e.g.
    //   Sentry.captureException(err, { extra: context });
    // Left as a no-op so the dependency stays optional for the pilot.
  }
}
