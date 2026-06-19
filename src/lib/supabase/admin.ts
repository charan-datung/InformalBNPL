import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client authenticated with the SERVICE ROLE key.
 *
 * This bypasses Row Level Security and can read/write anything — it is the
 * client used by trusted server-side mutation code. NEVER import this from a
 * Client Component or expose the service role key to the browser (it is read
 * from a non-public env var, so it only exists server-side).
 *
 * Unlike the cookie-based server client, this has no user session attached, so
 * it is also safe to use from scripts and dev route handlers.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY to be set.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
