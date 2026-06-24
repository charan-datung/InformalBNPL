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
 * The service-role key must actually grant service-role (RLS-bypassing) access.
 * The single most common deploy mistake is pasting the publishable/anon key (or
 * a placeholder) here — the admin client then runs with no privileges and every
 * server-side write fails with "permission denied for table …". Catch that shape
 * explicitly. Returns a problem message, or null if the key looks valid.
 */
export function serviceRoleKeyProblem(): string | null {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!k) return null; // emptiness is handled by missingServerEnv()
  if (k.startsWith("sb_publishable_")) {
    return "SUPABASE_SERVICE_ROLE_KEY is set to a PUBLISHABLE key. Use the SECRET key (sb_secret_…) or the legacy service_role JWT — the publishable key has no privileges and causes 'permission denied' on writes.";
  }
  const looksLikeSecret = k.startsWith("sb_secret_");
  const looksLikeJwt = k.split(".").length === 3 && k.length > 100;
  if (!looksLikeSecret && !looksLikeJwt) {
    return `SUPABASE_SERVICE_ROLE_KEY does not look like a valid service key (got "${k.slice(0, 8)}…"). Use the sb_secret_… key from Supabase → Settings → API Keys, or the legacy service_role JWT.`;
  }
  return null;
}

/**
 * Fail fast at boot if anything required is missing or obviously wrong. In
 * production these are fatal; in dev we warn so the app still boots without
 * Supabase fully wired.
 */
export function assertServerEnv(): void {
  const problems: string[] = [];
  const missing = missingServerEnv();
  if (missing.length > 0) {
    problems.push(`Missing required environment variables: ${missing.join(", ")}`);
  }
  const keyProblem = serviceRoleKeyProblem();
  if (keyProblem) problems.push(keyProblem);

  if (problems.length === 0) return;
  const message = problems.join(" | ");
  if ((process.env.NODE_ENV ?? "development") === "production") {
    throw new Error(message);
  }
  console.warn(`[env] ${message} — running in degraded mode (dev only).`);
}
