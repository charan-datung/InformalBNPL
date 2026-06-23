// Hard build-time guard: importing this module into a Client Component makes
// the build fail, so the service role key can never reach the browser bundle.
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Supabase client authenticated with the SERVICE ROLE key.
 *
 * This bypasses Row Level Security and can read/write anything — it is the
 * client used by trusted server-side mutation code. NEVER import this from a
 * Client Component or expose the service role key to the browser (it is read
 * from a non-public env var, so it only exists server-side; the `server-only`
 * import above enforces that at build time).
 *
 * Unlike the cookie-based server client, this has no user session attached, so
 * it is also safe to use from scripts and dev route handlers.
 */
export function createAdminClient() {
  return createSupabaseClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
