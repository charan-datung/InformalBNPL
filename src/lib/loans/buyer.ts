import { createAdminClient } from "@/lib/supabase/admin";
import { transitionLoan } from "@/lib/loans/mutations";
import { assertTransition, isLoanStatus } from "@/lib/loans/state-machine";
import { getConfigValue } from "@/lib/config/system-config";
import { disputeWindow } from "@/lib/loans/window";

/**
 * Buyer-initiated loan actions. Each verifies the loan actually belongs to the
 * acting buyer before doing anything, then runs the state-machine validator
 * (which also enforces the loan is in the right state). Booking itself reuses
 * bookLoan from mutations.ts.
 */

async function loadOwnedLoan(loanId: string, buyerUserId: string) {
  const admin = createAdminClient();
  const { data: loan, error } = await admin
    .from("loans")
    .select("buyer_user_id, status")
    .eq("id", loanId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!loan) throw new Error("Loan not found.");
  if (loan.buyer_user_id !== buyerUserId) {
    throw new Error("This loan does not belong to you.");
  }
  if (!isLoanStatus(loan.status)) throw new Error("Loan has an unknown status.");
  return { admin, status: loan.status };
}

/** Buyer confirms delivery: shipped -> delivered_confirmed. */
export async function confirmDelivery(input: {
  loanId: string;
  buyerUserId: string;
}): Promise<void> {
  await loadOwnedLoan(input.loanId, input.buyerUserId);
  await transitionLoan({
    loanId: input.loanId,
    to: "delivered_confirmed",
    actorUserId: input.buyerUserId,
    note: "Buyer confirmed delivery",
  });
}

/** Buyer raises a dispute: shipped -> dispute_raised (atomic RPC). */
export async function raiseDispute(input: {
  loanId: string;
  buyerUserId: string;
  reason: string;
  evidencePath?: string | null;
}): Promise<string> {
  const { admin, status } = await loadOwnedLoan(input.loanId, input.buyerUserId);

  // Source of truth for legality (only valid from `shipped`).
  assertTransition(status, "dispute_raised");

  // Enforce the dispute window at the data layer (not just the UI): once it has
  // elapsed, the buyer can no longer report a problem.
  const [{ data: shippedEvent }, disputeWindowDays] = await Promise.all([
    admin
      .from("escrow_events")
      .select("created_at")
      .eq("loan_id", input.loanId)
      .eq("event_type", "shipped")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    getConfigValue("dispute_window_days", admin),
  ]);
  const win = disputeWindow(shippedEvent?.created_at ?? null, disputeWindowDays);
  if (win.applicable && win.elapsed) {
    throw new Error("The reporting window for this order has closed.");
  }

  const { data, error } = await admin.rpc("raise_dispute", {
    p_loan_id: input.loanId,
    p_from: status,
    p_buyer: input.buyerUserId,
    p_reason: input.reason,
    p_evidence: input.evidencePath ?? null,
  });

  if (error) {
    if (error.code === "23514") {
      throw new Error("Loan state changed before the dispute could be raised.");
    }
    throw new Error(error.message);
  }
  return data as string;
}
