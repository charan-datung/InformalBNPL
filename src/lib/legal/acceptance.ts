import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_VERSION } from "@/lib/legal/lender";
import { computeLoanTerms, type LoanTerms } from "@/lib/loans/finance";
import { getConfigValue } from "@/lib/config/system-config";
import type { PaymentFrequency } from "@/lib/loans/schedule";

/**
 * Recording + reading borrower acceptance of legal documents. Append-only; all
 * writes go through the service-role client (the table is RLS-locked).
 */

export type DocumentType = "credit_agreement" | "disclosure_statement";

/** Best-effort client IP from the proxy headers, for the acceptance record. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

export async function recordDocumentAcceptance(input: {
  userId: string;
  loanId?: string | null;
  documentType: DocumentType;
  signatureName: string;
  ipAddress?: string | null;
  termsSnapshot?: LoanTerms | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("document_acceptances").insert({
    user_id: input.userId,
    loan_id: input.loanId ?? null,
    document_type: input.documentType,
    document_version: DOCUMENT_VERSION,
    signature_name: input.signatureName,
    ip_address: input.ipAddress ?? null,
    terms_snapshot: input.termsSnapshot ?? null,
  });
  // Never block the transaction on the acceptance write failing; log instead.
  if (error) console.error("recordDocumentAcceptance failed:", error.message);
}

/**
 * Record a borrower's acceptance of the per-loan Disclosure Statement, snapshotting
 * the exact terms (recomputed from the booked loan) as evidence of what was
 * disclosed before consummation.
 */
export async function recordLoanDisclosureAcceptance(input: {
  loan: {
    id: string;
    ticket_centavos: number;
    tenor_months: number;
    interest_rate_monthly: number;
    payment_frequency: PaymentFrequency;
    processing_fee_centavos: number;
  };
  userId: string;
  signatureName: string;
  ipAddress?: string | null;
}): Promise<void> {
  const penalty = await getConfigValue("penalty_rate_monthly");
  const feePct =
    input.loan.ticket_centavos > 0
      ? (input.loan.processing_fee_centavos / input.loan.ticket_centavos) * 100
      : 0;
  const terms = computeLoanTerms({
    principalCentavos: input.loan.ticket_centavos,
    tenorMonths: input.loan.tenor_months,
    interestRateMonthly: input.loan.interest_rate_monthly,
    frequency: input.loan.payment_frequency,
    processingFeePct: feePct,
    penaltyRateMonthly: penalty,
  });
  await recordDocumentAcceptance({
    userId: input.userId,
    loanId: input.loan.id,
    documentType: "disclosure_statement",
    signatureName: input.signatureName,
    ipAddress: input.ipAddress ?? null,
    termsSnapshot: terms,
  });
}

/** Whether this borrower has already accepted the master Credit Agreement. */
export async function hasAcceptedCreditAgreement(
  userId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("document_acceptances")
    .select("id")
    .eq("user_id", userId)
    .eq("document_type", "credit_agreement")
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
