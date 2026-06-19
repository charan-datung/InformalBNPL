import { createAdminClient } from "@/lib/supabase/admin";
import { transitionLoan, releaseEscrow } from "@/lib/loans/mutations";
import { recordAudit } from "@/lib/audit/log";

/**
 * Resolve a dispute and move the underlying loan accordingly:
 *   - buyer's favour  -> loan is refunded.
 *   - seller's favour -> escrow is released (with the merchant-fee deduction).
 *
 * Both outcomes go through the loan state machine (the loan must be in
 * `dispute_raised`, which the validator enforces). A `dispute_resolved` audit
 * event is recorded on the loan in addition to the refund/release events.
 */

export type ResolveDisputeInput = {
  disputeId: string;
  outcome: "buyer" | "seller";
  note?: string | null;
  actorUserId: string;
};

export async function resolveDispute(input: ResolveDisputeInput): Promise<void> {
  const admin = createAdminClient();

  const { data: dispute, error } = await admin
    .from("disputes")
    .select("id, loan_id, status")
    .eq("id", input.disputeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!dispute) throw new Error("Dispute not found.");
  if (dispute.status !== "open" && dispute.status !== "under_review") {
    throw new Error("Dispute is already resolved.");
  }

  // Audit the resolution on the loan's append-only log.
  await admin.from("escrow_events").insert({
    loan_id: dispute.loan_id,
    event_type: "dispute_resolved",
    note: `Resolved in ${input.outcome}'s favour. ${input.note ?? ""}`.trim(),
    actor_user_id: input.actorUserId,
  });

  // Close out the dispute row.
  const { error: dErr } = await admin
    .from("disputes")
    .update({
      status: "resolved",
      resolution: `${input.outcome}_favour: ${input.note ?? ""}`.trim(),
      resolved_by_user_id: input.actorUserId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", input.disputeId);
  if (dErr) throw new Error(dErr.message);

  await recordAudit(admin, {
    actorUserId: input.actorUserId,
    action: `dispute_resolved_${input.outcome}`,
    entityType: "dispute",
    entityId: input.disputeId,
    detail: { loan_id: dispute.loan_id, note: input.note ?? null },
  });

  // Move the loan. These run the state-machine validator (valid from
  // dispute_raised) and write their own audit events.
  if (input.outcome === "buyer") {
    await transitionLoan({
      loanId: dispute.loan_id,
      to: "refunded",
      actorUserId: input.actorUserId,
      note: "Dispute resolved in buyer's favour",
    });
  } else {
    await releaseEscrow({
      loanId: dispute.loan_id,
      actorUserId: input.actorUserId,
      note: "Escrow released — dispute resolved in seller's favour",
    });
  }
}
