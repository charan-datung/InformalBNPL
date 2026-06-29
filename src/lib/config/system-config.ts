import { cache } from "react";
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
  /** One-time processing/service fee as a percent of principal (3 = 3%). Part of
   *  the finance charge and the EIR. PLACEHOLDER — confirm the official figure;
   *  must keep the loan's EIR within the SEC MC 3-2022 ceiling. */
  processing_fee_pct: 3,
  /** Penalty/default interest per month on overdue amounts (0.05 = 5%/mo) — the
   *  SEC MC 3-2022 ceiling for covered short-term loans. */
  penalty_rate_monthly: 0.05,
  /** Merchant discount rate (MDR) charged to sellers on each sale (7 = 7%). */
  default_merchant_fee_pct: 7,
  /** Default rolling-reserve percent withheld from sellers. 0 by default —
   *  escrow + dispute window + handover code + manual payouts already cover the
   *  post-payout clawback risk a reserve guards, so held cash is just friction
   *  for informal sellers. Operators can still set a per-seller reserve on a
   *  flagged account from the review screen. */
  default_reserve_pct: 0,
  /** Default buyer credit limit in centavos (500_000 = ₱5,000.00). */
  default_credit_limit_centavos: 500_000,
  /** Hard ceiling (centavos) an operator may approve a buyer at (₱5,000). A
   *  buyer cannot be onboarded above this; raise it here to lift the cap. */
  max_credit_limit_centavos: 500_000,
  /** Default loan tenor (months) prefilled at checkout. */
  default_tenor_months: 3,
  /** Longest tenor (months) a buyer may choose at checkout. */
  max_tenor_months: 4,
  /** Days after escrow release before the seller's payout is committed. */
  seller_payout_days: 2,
  /** How many days before an installment's due date to send the buyer a heads-up
   *  reminder email (the daily reminder cron reads this). */
  reminder_days_before: 3,
  /** Exposure cap (centavos) for a `new`, ungraduated seller (₱5,000). */
  seller_cap_new_centavos: 500_000,
  /** Exposure cap (centavos) for a `trusted` seller (₱50,000). */
  seller_cap_trusted_centavos: 5_000_000,
  /** Rolling reserve % withheld from a `new` seller's payouts. */
  seller_reserve_new_pct: 10,
  /** Rolling reserve % withheld from a `trusted` seller's payouts. */
  seller_reserve_trusted_pct: 5,
  /** Clean (settled) fulfilments before a `new` seller auto-graduates. */
  seller_graduation_threshold: 10,
  /** Cash bounty (centavos) owed to a seller when a seller they referred
   *  completes their first order (escrow released). Settled off-platform by the
   *  operator (₱200 default). */
  seller_referral_reward_centavos: 20_000,
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
async function loadConfig(client?: SupabaseClient): Promise<SystemConfig> {
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

// Per-request memo for the common (no explicit client) path: config is global
// and several panels/pages read it in one render, so this collapses those into a
// single DB read. Calls that pass their own client (inside mutations) bypass it.
const loadConfigMemo = cache(() => loadConfig());

export async function getConfig(client?: SupabaseClient): Promise<SystemConfig> {
  return client ? loadConfig(client) : loadConfigMemo();
}
