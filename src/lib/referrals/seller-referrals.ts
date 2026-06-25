import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigValue } from "@/lib/config/system-config";

/**
 * Seller-to-seller referral rewards.
 *
 * Lifecycle: a referred seller applies -> `pending`; their first order is booked
 * -> `qualified` (bounty snapshotted); the operator settles off-platform ->
 * `paid`. All writes use the service-role admin client (the table is RLS-locked
 * with no policies), so these run server-side only.
 */

export type ReferralStatus = "pending" | "qualified" | "paid" | "void";

/**
 * Record a pending referral when a referred user applies as a seller. No-op
 * unless the referrer is a real, verified seller and isn't the referred person.
 * Idempotent: the unique referred_user_id makes a repeat apply a no-op.
 */
export async function recordSellerReferral(
  admin: SupabaseClient,
  referredUserId: string,
  referrerUserId: string,
): Promise<void> {
  if (!referrerUserId || referrerUserId === referredUserId) return;

  // Only verified sellers can earn referral bounties.
  const { data: referrer } = await admin
    .from("seller_profiles")
    .select("kyc_status")
    .eq("user_id", referrerUserId)
    .maybeSingle();
  if (!referrer || referrer.kyc_status !== "verified") return;

  await admin.from("seller_referrals").upsert(
    {
      referrer_user_id: referrerUserId,
      referred_user_id: referredUserId,
      status: "pending",
    },
    { onConflict: "referred_user_id", ignoreDuplicates: true },
  );
}

/**
 * Qualify a referred seller's pending referral when their first order is booked.
 * Called from the booking path for every loan; cheap no-op when the seller
 * wasn't referred or the referral already qualified. Snapshots the current
 * bounty so later config changes don't alter what's owed.
 */
export async function maybeQualifySellerReferral(
  admin: SupabaseClient,
  sellerUserId: string,
): Promise<void> {
  const { data: ref } = await admin
    .from("seller_referrals")
    .select("id")
    .eq("referred_user_id", sellerUserId)
    .eq("status", "pending")
    .maybeSingle();
  if (!ref) return;

  const reward = await getConfigValue(
    "seller_referral_reward_centavos",
    admin,
  );
  await admin
    .from("seller_referrals")
    .update({
      status: "qualified",
      reward_centavos: reward,
      qualified_at: new Date().toISOString(),
    })
    .eq("id", ref.id)
    .eq("status", "pending");
}

export type ReferralRewardRow = {
  id: string;
  status: ReferralStatus;
  rewardCentavos: number | null;
  qualifiedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  referrerName: string | null;
  referrerContact: string | null;
  referredName: string | null;
  referredContact: string | null;
};

// Qualified bounties first (they need action), then pending, then settled.
const STATUS_ORDER: Record<ReferralStatus, number> = {
  qualified: 0,
  pending: 1,
  paid: 2,
  void: 3,
};

/** Operator view: every referral with both parties' names, action-first. */
export async function listSellerReferralRewards(): Promise<ReferralRewardRow[]> {
  const admin = createAdminClient();
  const { data: refs, error } = await admin
    .from("seller_referrals")
    .select(
      "id, status, reward_centavos, qualified_at, paid_at, created_at, referrer_user_id, referred_user_id",
    )
    .order("created_at", { ascending: false });
  if (error || !refs) return [];

  const ids = Array.from(
    new Set(refs.flatMap((r) => [r.referrer_user_id, r.referred_user_id])),
  );
  const { data: users } = await admin
    .from("users")
    .select("id, name, contact")
    .in("id", ids);
  const byId = new Map(
    (users ?? []).map((u) => [u.id, { name: u.name, contact: u.contact }]),
  );

  return refs
    .map((r) => {
      const referrer = byId.get(r.referrer_user_id);
      const referred = byId.get(r.referred_user_id);
      return {
        id: r.id,
        status: r.status as ReferralStatus,
        rewardCentavos: r.reward_centavos,
        qualifiedAt: r.qualified_at,
        paidAt: r.paid_at,
        createdAt: r.created_at,
        referrerName: referrer?.name ?? null,
        referrerContact: referrer?.contact ?? null,
        referredName: referred?.name ?? null,
        referredContact: referred?.contact ?? null,
      };
    })
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (a.createdAt < b.createdAt ? 1 : -1),
    );
}

/** Operator action: mark a qualified bounty as settled. */
export async function markReferralPaid(id: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("seller_referrals")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "qualified");
}

export type SellerReferralSummary = {
  total: number;
  pending: number;
  qualified: number;
  paid: number;
  /** Earned but not yet settled (qualified). */
  owedCentavos: number;
  /** Already settled (paid). */
  paidCentavos: number;
};

/** Seller dashboard: how many sellers they've referred and what they've earned. */
export async function getSellerReferralSummary(
  referrerUserId: string,
): Promise<SellerReferralSummary> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("seller_referrals")
    .select("status, reward_centavos")
    .eq("referrer_user_id", referrerUserId);

  const empty: SellerReferralSummary = {
    total: 0,
    pending: 0,
    qualified: 0,
    paid: 0,
    owedCentavos: 0,
    paidCentavos: 0,
  };
  if (error || !data) return empty;

  return data.reduce((acc, r) => {
    acc.total += 1;
    if (r.status === "pending") acc.pending += 1;
    if (r.status === "qualified") {
      acc.qualified += 1;
      acc.owedCentavos += r.reward_centavos ?? 0;
    }
    if (r.status === "paid") {
      acc.paid += 1;
      acc.paidCentavos += r.reward_centavos ?? 0;
    }
    return acc;
  }, empty);
}
