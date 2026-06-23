/**
 * Next.js instrumentation — runs once when the server process starts, and on
 * every uncaught request error. Used to (1) validate required env at boot so a
 * misconfigured deploy fails fast, and (2) funnel server errors through our
 * capture path.
 */

export async function register() {
  // Node runtime only (skip the edge runtime, which lacks process env access).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertServerEnv } = await import("@/lib/env");
    assertServerEnv();
  }
}

export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routePath?: string; routeType?: string },
) {
  const { captureException } = await import("@/lib/observability/logger");
  captureException(error, {
    path: request?.path,
    method: request?.method,
    routePath: context?.routePath,
    routeType: context?.routeType,
  });
}
