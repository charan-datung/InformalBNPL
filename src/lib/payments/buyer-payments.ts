import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { maybeGraduateBuyer } from "@/lib/loans/graduation";

/**
 * Buyer payment reports + operator confirmation. A buyer who has paid an
 * installment (via the GCash QR / bank transfer) submits the reference so the
 * operator confirms against evidence instead of marking paid blind. Confirming
 * runs apply_payment, which allocates the amount across open installments
 * (partial/overpayment aware) and posts the balanced ledger leg.
 */

export type PaymentMethod = "gcash" | "maya" | "bank" | "other";

export async function submitPaymentReport(input: {
  loanId: string;
  buyerUserId: string;
  amountCentavos: number;
  referenceNo: string;
  method: PaymentMethod;
  proofPath?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  if (!Number.isInteger(input.amountCentavos) || input.amountCentavos <= 0) {
    throw new Error("Enter the amount you paid.");
  }
  if (!input.referenceNo.trim()) {
    throw new Error("Enter the reference number from your receipt.");
  }

  const { data: loan } = await admin
    .from("loans")
    .select("buyer_user_id, status")
    .eq("id", input.loanId)
    .maybeSingle();
  if (!loan || loan.buyer_user_id !== input.buyerUserId) {
    throw new Error("This order doesn't belong to you.");
  }

  const { error } = await admin.from("payments").insert({
    loan_id: input.loanId,
    amount_centavos: input.amountCentavos,
    reference_no: input.referenceNo.trim(),
    method: input.method,
    proof_path: input.proofPath ?? null,
    status: "reported",
    reported_by: input.buyerUserId,
  });
  if (error) throw new Error(error.message);
}

export type PendingPayment = {
  id: string;
  loan_id: string;
  amount_centavos: number;
  reference_no: string | null;
  method: string | null;
  proofUrl: string | null;
  created_at: string;
  buyerName: string;
  sellerName: string;
  ticket_centavos: number;
  outstanding_centavos: number;
};

/** Reported (unconfirmed) payments for the operator confirmation queue. */
export async function listPendingPayments(): Promise<PendingPayment[]> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("payments")
    .select("*")
    .eq("status", "reported")
    .order("created_at", { ascending: true });
  const payments = rows ?? [];
  if (payments.length === 0) return [];

  const loanIds = [...new Set(payments.map((p) => p.loan_id))];
  const [{ data: loans }, { data: users }, { data: reps }] = await Promise.all([
    admin
      .from("loans")
      .select("id, buyer_user_id, seller_user_id, ticket_centavos")
      .in("id", loanIds),
    admin.from("users").select("id, name"),
    admin
      .from("repayments")
      .select("loan_id, amount_centavos, paid_centavos, status")
      .in("loan_id", loanIds),
  ]);
  const loanById = new Map((loans ?? []).map((l) => [l.id, l]));
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name as string]));
  const outstanding = new Map<string, number>();
  for (const r of reps ?? []) {
    if (r.status === "waived") continue;
    const left = r.amount_centavos - (r.paid_centavos ?? 0);
    outstanding.set(r.loan_id, (outstanding.get(r.loan_id) ?? 0) + Math.max(0, left));
  }

  return Promise.all(
    payments.map(async (p) => {
      const loan = loanById.get(p.loan_id);
      let proofUrl: string | null = null;
      if (p.proof_path) {
        const { data: signed } = await admin.storage
          .from("payment-proof")
          .createSignedUrl(p.proof_path, 300);
        proofUrl = signed?.signedUrl ?? null;
      }
      return {
        id: p.id,
        loan_id: p.loan_id,
        amount_centavos: p.amount_centavos,
        reference_no: p.reference_no,
        method: p.method,
        proofUrl,
        created_at: p.created_at,
        buyerName: loan ? (nameById.get(loan.buyer_user_id) ?? loan.buyer_user_id) : "—",
        sellerName: loan ? (nameById.get(loan.seller_user_id) ?? loan.seller_user_id) : "—",
        ticket_centavos: loan?.ticket_centavos ?? 0,
        outstanding_centavos: outstanding.get(p.loan_id) ?? 0,
      };
    }),
  );
}

/** Operator confirms a reported payment → allocate it across installments. */
export async function confirmPayment(input: {
  paymentId: string;
  actorUserId: string;
}): Promise<{ allocatedCentavos: number; excessCentavos: number }> {
  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("id, loan_id, amount_centavos, status")
    .eq("id", input.paymentId)
    .maybeSingle();
  if (!payment) throw new Error("Payment not found.");
  if (payment.status !== "reported") {
    throw new Error("This payment was already handled.");
  }

  const { data, error } = await admin.rpc("apply_payment", {
    p_loan_id: payment.loan_id,
    p_amount: payment.amount_centavos,
    p_actor: input.actorUserId,
    p_payment_id: payment.id,
  });
  if (error) throw new Error(error.message);
  await maybeGraduateBuyer(admin, payment.loan_id);
  const r = data as { allocated_centavos: number; excess_centavos: number };
  return { allocatedCentavos: r.allocated_centavos, excessCentavos: r.excess_centavos };
}

export async function rejectPayment(input: {
  paymentId: string;
  actorUserId: string;
  note: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("payments")
    .update({
      status: "rejected",
      confirmed_by: input.actorUserId,
      confirmed_at: new Date().toISOString(),
      note: input.note,
    })
    .eq("id", input.paymentId)
    .eq("status", "reported");
  if (error) throw new Error(error.message);
}

export type BuyerPaymentLite = {
  id: string;
  amount_centavos: number;
  reference_no: string | null;
  method: string | null;
  status: string;
  created_at: string;
  confirmed_at: string | null;
};

/** A buyer's own payment history (for receipts / records). */
export async function listBuyerPayments(
  buyerUserId: string,
): Promise<BuyerPaymentLite[]> {
  const admin = createAdminClient();
  // Scope to this buyer's loans.
  const { data: loans } = await admin
    .from("loans")
    .select("id")
    .eq("buyer_user_id", buyerUserId);
  const ids = (loans ?? []).map((l) => l.id);
  if (ids.length === 0) return [];
  const { data } = await admin
    .from("payments")
    .select("id, amount_centavos, reference_no, method, status, created_at, confirmed_at")
    .in("loan_id", ids)
    .order("created_at", { ascending: false });
  return (data ?? []) as BuyerPaymentLite[];
}
