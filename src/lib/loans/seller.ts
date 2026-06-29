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

/**
 * Seller confirms an in-person hand-over by entering the 6-digit code shown on
 * the buyer's screen. Proves the goods actually changed hands (anti-fraud) and
 * starts the dispute window: escrow_held -> shipped. The code is checked against
 * the value minted at authorization; a wrong code is rejected without advancing.
 */
export async function confirmHandover(input: {
  loanId: string;
  sellerUserId: string;
  code: string;
}): Promise<void> {
  const admin = createAdminClient();
  const code = input.code.replace(/\D/g, "");
  if (code.length !== 6) {
    throw new Error("Enter the 6-digit code from the buyer's screen.");
  }

  const { data: loan, error } = await admin
    .from("loans")
    .select("seller_user_id, status, handover_code, handover_confirmed_at")
    .eq("id", input.loanId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!loan) throw new Error("Loan not found.");
  if (loan.seller_user_id !== input.sellerUserId) {
    throw new Error("This loan does not belong to you.");
  }
  if (loan.handover_confirmed_at) {
    throw new Error("This hand-over was already confirmed.");
  }
  if (!isLoanStatus(loan.status)) throw new Error("Loan has an unknown status.");
  if (loan.status !== "escrow_held") {
    throw new Error("This order is not awaiting a hand-over.");
  }
  if (!loan.handover_code || loan.handover_code !== code) {
    throw new Error("That code doesn't match. Ask the buyer to read it again.");
  }

  // Stamp the confirmation, then advance (the validator enforces escrow_held).
  const { error: updErr } = await admin
    .from("loans")
    .update({ handover_confirmed_at: new Date().toISOString() })
    .eq("id", input.loanId);
  if (updErr) throw new Error(updErr.message);

  await transitionLoan({
    loanId: input.loanId,
    to: "shipped",
    actorUserId: input.sellerUserId,
    note: "Buyer received item in person (hand-over code confirmed)",
  });
}
