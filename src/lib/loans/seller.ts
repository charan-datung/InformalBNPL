import { createAdminClient } from "@/lib/supabase/admin";
import { transitionLoan } from "@/lib/loans/mutations";
import { isLoanStatus } from "@/lib/loans/state-machine";

/**
 * Seller-initiated loan actions. Verifies the loan belongs to the acting seller
 * before doing anything, then runs the state-machine validator (which enforces
 * the loan is in the right state).
 */

/** Seller marks the item shipped (with proof): escrow_held -> shipped. */
export async function markShipped(input: {
  loanId: string;
  sellerUserId: string;
  proofPath: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: loan, error } = await admin
    .from("loans")
    .select("seller_user_id, status")
    .eq("id", input.loanId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!loan) throw new Error("Loan not found.");
  if (loan.seller_user_id !== input.sellerUserId) {
    throw new Error("This loan does not belong to you.");
  }
  if (!isLoanStatus(loan.status)) throw new Error("Loan has an unknown status.");

  // Store the proof path, then transition (the validator enforces escrow_held).
  const { error: updErr } = await admin
    .from("loans")
    .update({ shipment_proof_path: input.proofPath })
    .eq("id", input.loanId);
  if (updErr) throw new Error(updErr.message);

  await transitionLoan({
    loanId: input.loanId,
    to: "shipped",
    actorUserId: input.sellerUserId,
    note: "Seller marked shipped (proof attached)",
  });
}
