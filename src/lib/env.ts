/**
 * Centralised environment access + boot-time validation.
 *
 * Required vars are checked once at startup (see instrumentation.ts) so a
 * misconfigured deploy fails fast with a clear message naming every missing
 * var, instead of throwing deep in a request handler later. Accessors are lazy
 * functions so merely importing this module never throws.
 */

/** Server-only secrets + public config the app cannot run without. */
export const REQUIRED_SERVER_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  /** Optional: when set, server errors are forwarded to Sentry. */
  sentryDsn: (): string | null => process.env.SENTRY_DSN ?? null,
  nodeEnv: (): string => process.env.NODE_ENV ?? "development",
};

/** Names of any required server env vars that are missing/empty. */
export function missingServerEnv(): string[] {
  return REQUIRED_SERVER_ENV.filter((k) => !process.env[k]);
}

/**
 * Fail fast at boot if anything required is missing. In production a missing
 * var is fatal; in dev we warn so the app still boots without Supabase wired.
 */
export function assertServerEnv(): void {
  const missing = missingServerEnv();
  if (missing.length === 0) return;
  const message = `Missing required environment variables: ${missing.join(", ")}`;
  if ((process.env.NODE_ENV ?? "development") === "production") {
    throw new Error(message);
  }
  console.warn(`[env] ${message} — running in degraded mode (dev only).`);
}
