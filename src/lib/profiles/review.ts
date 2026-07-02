import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit/log";
import { getConfig } from "@/lib/config/system-config";
import { sendApprovalEmail, type ApprovalEmailResult } from "@/lib/email/notify";
import { fraudFlagsForUsers } from "@/lib/operator/fraud-flags";
import {
  scoreBuyer,
  scoreSeller,
  type BuyerScore,
  type SellerScore,
} from "@/lib/credit/scoring";
import type { BuyerApplication } from "@/lib/profiles/buyer-application";

/**
 * Operator review of pending buyer/seller applications. Approval is fully
 * manual — there is no automated decision. Writes go through the service role.
 *
 * (Profile approvals are not loan-scoped, so they are not recorded in
 * escrow_events — that log is for loan state. The decision is captured on the
 * profile row itself: kyc_status, the configured limits/tiers, and notes.)
 */

export type BuyerReviewInput = {
  userId: string;
  decision: "approve" | "reject";
  creditLimitCentavos: number;
  notes?: string | null;
  actorUserId: string;
};

/**
 * On approval, returns the approval-email outcome so the caller can confirm the
 * member was notified (or surface why not). Null on rejection (no email sent).
 */
export async function reviewBuyer(
  input: BuyerReviewInput,
): Promise<ApprovalEmailResult | null> {
  const admin = createAdminClient();
  const config = await getConfig(admin);

  // Backstop: never persist a limit above the configured ceiling, regardless of
  // caller. The operator action validates first with a clear message; this clamp
  // guards any other path into this mutation.
  const creditLimitCentavos = Math.min(
    input.creditLimitCentavos,
    config.max_credit_limit_centavos,
  );

  // Snapshot the scorecard at decision time (recomputed here, never trusted from
  // the page) so the audit row pairs the recommendation with what the operator
  // actually granted — the raw material for backtesting bands against repayment.
  let credit: BuyerScore | null = null;
  try {
    const [{ data: bp }, flags] = await Promise.all([
      admin
        .from("buyer_profiles")
        .select("buyer_kind, application, location_consent")
        .eq("user_id", input.userId)
        .maybeSingle(),
      fraudFlagsForUsers([input.userId]),
    ]);
    if (bp) {
      credit = scoreBuyer({
        buyerKind:
          bp.buyer_kind === "personal" || bp.buyer_kind === "business"
            ? bp.buyer_kind
            : null,
        application: (bp.application as BuyerApplication | null) ?? null,
        fraudFlags: flags.get(input.userId) ?? [],
        locationConsent: Boolean(bp.location_consent),
        config: {
          defaultLimitCentavos: config.default_credit_limit_centavos,
          maxLimitCentavos: config.max_credit_limit_centavos,
        },
      });
    }
  } catch (e) {
    // Scoring is evidence, not a gate — never block the decision on it.
    console.error("reviewBuyer scoring snapshot failed:", e);
  }

  const patch =
    input.decision === "approve"
      ? {
          kyc_status: "verified" as const,
          credit_limit_centavos: creditLimitCentavos,
          underwriting_notes: input.notes ?? null,
          activated_at: new Date().toISOString(),
        }
      : {
          kyc_status: "rejected" as const,
          underwriting_notes: input.notes ?? null,
          activated_at: null,
        };

  const { error } = await admin
    .from("buyer_profiles")
    .update(patch)
    .eq("user_id", input.userId);
  if (error) throw new Error(error.message);

  await recordAudit(admin, {
    actorUserId: input.actorUserId,
    action: input.decision === "approve" ? "buyer_approved" : "buyer_rejected",
    entityType: "buyer_profile",
    entityId: input.userId,
    detail: {
      credit_limit_centavos:
        input.decision === "approve" ? creditLimitCentavos : null,
      notes: input.notes ?? null,
      credit_score: credit
        ? {
            score: credit.score,
            band: credit.band,
            recommended_limit_centavos: credit.recommendedLimitCentavos,
            review_carefully: credit.reviewCarefully,
            reasons: credit.reasons,
          }
        : null,
    },
  });

  // Tell the buyer they're in (best-effort; never blocks the approval).
  if (input.decision === "approve") {
    return sendApprovalEmail(admin, input.userId, "buyer");
  }
  return null;
}

export type SellerReviewInput = {
  userId: string;
  decision: "approve" | "reject";
  trustTier: "new" | "trusted";
  reservePct: number;
  /** Optional explicit exposure cap; defaults to the tier cap from config. */
  maxOutstandingCentavos?: number;
  notes?: string | null;
  actorUserId: string;
};

export async function reviewSeller(
  input: SellerReviewInput,
): Promise<ApprovalEmailResult | null> {
  const admin = createAdminClient();

  // Exposure cap follows the tier (conservative for `new`, higher once trusted)
  // unless the operator passes an explicit override.
  const config = await getConfig(admin);
  const tierCap =
    input.trustTier === "trusted"
      ? config.seller_cap_trusted_centavos
      : config.seller_cap_new_centavos;

  // Scorecard snapshot at decision time (see reviewBuyer) — evidence, not a gate.
  let credit: SellerScore | null = null;
  try {
    const [{ data: sp }, flags] = await Promise.all([
      admin
        .from("seller_profiles")
        .select(
          "sells_what, social_handle, marketplace_url, selling_since, id_type, storefront_lat, storefront_lng, location_consent",
        )
        .eq("user_id", input.userId)
        .maybeSingle(),
      fraudFlagsForUsers([input.userId]),
    ]);
    if (sp) {
      credit = scoreSeller({
        sellsWhat: sp.sells_what,
        socialHandle: sp.social_handle,
        marketplaceUrl: sp.marketplace_url,
        sellingSince: sp.selling_since,
        idType: sp.id_type,
        hasStorefrontPin: sp.storefront_lat != null && sp.storefront_lng != null,
        locationConsent: Boolean(sp.location_consent),
        fraudFlags: flags.get(input.userId) ?? [],
        config: {
          capNewCentavos: config.seller_cap_new_centavos,
          capTrustedCentavos: config.seller_cap_trusted_centavos,
          reserveNewPct: config.seller_reserve_new_pct,
          reserveTrustedPct: config.seller_reserve_trusted_pct,
        },
        nowYear: new Date().getFullYear(),
      });
    }
  } catch (e) {
    console.error("reviewSeller scoring snapshot failed:", e);
  }

  const patch =
    input.decision === "approve"
      ? {
          kyc_status: "verified" as const,
          trust_tier: input.trustTier,
          rolling_reserve_pct: input.reservePct,
          max_outstanding_centavos: input.maxOutstandingCentavos ?? tierCap,
          verification_notes: input.notes ?? null,
          activated_at: new Date().toISOString(),
        }
      : {
          kyc_status: "rejected" as const,
          verification_notes: input.notes ?? null,
          activated_at: null,
        };

  const { error } = await admin
    .from("seller_profiles")
    .update(patch)
    .eq("user_id", input.userId);
  if (error) throw new Error(error.message);

  await recordAudit(admin, {
    actorUserId: input.actorUserId,
    action: input.decision === "approve" ? "seller_approved" : "seller_rejected",
    entityType: "seller_profile",
    entityId: input.userId,
    detail: {
      trust_tier: input.decision === "approve" ? input.trustTier : null,
      reserve_pct: input.decision === "approve" ? input.reservePct : null,
      max_outstanding_centavos:
        input.decision === "approve"
          ? (input.maxOutstandingCentavos ?? tierCap)
          : null,
      notes: input.notes ?? null,
      credit_score: credit
        ? {
            score: credit.score,
            band: credit.band,
            recommended_cap_centavos: credit.recommendedCapCentavos,
            recommended_reserve_pct: credit.recommendedReservePct,
            review_carefully: credit.reviewCarefully,
            reasons: credit.reasons,
          }
        : null,
    },
  });

  // Tell the seller they're in (best-effort; never blocks the approval).
  if (input.decision === "approve") {
    return sendApprovalEmail(admin, input.userId, "seller");
  }
  return null;
}
