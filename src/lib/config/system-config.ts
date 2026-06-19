import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * System configuration with code-defined fallback defaults.
 *
 * The `system_config` table holds admin overrides; the defaults below are the
 * baseline used when a key has no row (e.g. a fresh database) or when the read
 * fails. Reads always succeed against these defaults, so calling code never has
 * to handle "config missing".
 *
 * Money is in centavos; percentages are whole-number percents (5 = 5%); rates
 * are monthly decimals (0.035 = 3.5%/month).
 *
 * Keep this in sync with the keys seeded in supabase/seed.sql.
 */
export const CONFIG_DEFAULTS = {
  /** Days a buyer has to raise a dispute after delivery/auto-release. */
  dispute_window_days: 7,
  /** Days after "shipped" before escrow auto-releases with no action. */
  auto_release_days: 3,
  /** Default monthly interest rate applied to new loans (0.035 = 3.5%/mo). */
  default_interest_rate_monthly: 0.035,
  /** Default merchant fee percent charged to sellers (5 = 5%). */
  default_merchant_fee_pct: 5,
  /** Default rolling-reserve percent withheld from new sellers (10 = 10%). */
  default_reserve_pct: 10,
  /** Default buyer credit limit in centavos (5_000_000 = ₱50,000.00). */
  default_credit_limit_centavos: 5_000_000,
} as const;

export type SystemConfig = typeof CONFIG_DEFAULTS;
export type ConfigKey = keyof SystemConfig;

/**
 * Read a single config value, falling back to the code default if there is no
 * override row or the read errors. Server-only.
 *
 * Pass a `client` to reuse an existing Supabase client (e.g. the service-role
 * admin client inside a mutation); omit it to use the cookie-based server
 * client.
 */
export async function getConfigValue<K extends ConfigKey>(
  key: K,
  client?: SupabaseClient,
): Promise<SystemConfig[K]> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error || !data || data.value === null) {
    return CONFIG_DEFAULTS[key];
  }
  return data.value as SystemConfig[K];
}

/**
 * Read the full config: code defaults merged with any overrides from the table.
 * Unknown keys in the table are ignored. Server-only. Pass a `client` to reuse
 * an existing Supabase client; omit it to use the cookie-based server client.
 */
export async function getConfig(client?: SupabaseClient): Promise<SystemConfig> {
  const merged: SystemConfig = { ...CONFIG_DEFAULTS };

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("system_config")
    .select("key, value");

  if (error || !data) {
    return merged;
  }

  for (const row of data) {
    if (row.key in merged && row.value !== null) {
      // Narrowed by the `key in merged` check above.
      (merged as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return merged;
}
