import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "@/lib/config/system-config";
import { recordAudit } from "@/lib/audit/log";

/**
 * Buyer credit graduation. After enough on-time payments, raise the buyer's
 * credit limit a step at a time, up to the hard ceiling. Idempotent: a milestone
 * is floor(onTime / threshold); we only grant the difference vs the milestones
 * already counted (graduation_count), so re-running or batch payments never
 * double-bump. Best-effort — never blocks a payment confirmation.
 */
export async function maybeGraduateBuyer(
  admin: SupabaseClient,
  loanId: string,
): Promise<void> {
  try {
    const { data: loan } = await admin
      .from("loans")
      .select("buyer_user_id")
      .eq("id", loanId)
      .maybeSingle();
    if (!loan) return;
    const buyerId = loan.buyer_user_id as string;

    const config = await getConfig(admin);
    const threshold = config.buyer_graduation_threshold;
    const step = config.buyer_graduation_step_centavos;
    const ceiling = config.max_credit_limit_centavos;
    if (threshold <= 0 || step <= 0) return;

    const { data: profile } = await admin
      .from("buyer_profiles")
      .select("credit_limit_centavos, graduation_count")
      .eq("user_id", buyerId)
      .maybeSingle();
    if (!profile) return;

    // Count on-time paid installments across this buyer's loans.
    const { data: loans } = await admin
      .from("loans")
      .select("id")
      .eq("buyer_user_id", buyerId);
    const ids = (loans ?? []).map((l) => l.id);
    if (ids.length === 0) return;
    const { data: reps } = await admin
      .from("repayments")
      .select("due_date, paid_at, status")
      .in("loan_id", ids)
      .eq("status", "paid");
    const onTime = (reps ?? []).filter(
      (r) => r.paid_at && r.paid_at.slice(0, 10) <= r.due_date,
    ).length;

    const milestone = Math.floor(onTime / threshold);
    const already = profile.graduation_count ?? 0;
    if (milestone <= already) return;

    const current = profile.credit_limit_centavos ?? 0;
    const newLimit = Math.min(ceiling, current + (milestone - already) * step);

    await admin
      .from("buyer_profiles")
      .update({ credit_limit_centavos: newLimit, graduation_count: milestone })
      .eq("user_id", buyerId);

    if (newLimit !== current) {
      await recordAudit(admin, {
        actorUserId: buyerId,
        action: "buyer_limit_graduated",
        entityType: "buyer_profile",
        entityId: buyerId,
        detail: { from: current, to: newLimit, on_time_payments: onTime },
      });
    }
  } catch (e) {
    console.error("maybeGraduateBuyer failed:", e);
  }
}
