import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit/log";
import { getConfig, getConfigValue } from "@/lib/config/system-config";

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

export async function reviewBuyer(input: BuyerReviewInput): Promise<void> {
  const admin = createAdminClient();

  // Backstop: never persist a limit above the configured ceiling, regardless of
  // caller. The operator action validates first with a clear message; this clamp
  // guards any other path into this mutation.
  const maxLimitCentavos = await getConfigValue("max_credit_limit_centavos", admin);
  const creditLimitCentavos = Math.min(input.creditLimitCentavos, maxLimitCentavos);

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
    },
  });
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

export async function reviewSeller(input: SellerReviewInput): Promise<void> {
  const admin = createAdminClient();

  // Exposure cap follows the tier (conservative for `new`, higher once trusted)
  // unless the operator passes an explicit override.
  const config = await getConfig(admin);
  const tierCap =
    input.trustTier === "trusted"
      ? config.seller_cap_trusted_centavos
      : config.seller_cap_new_centavos;

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
    },
  });
}
