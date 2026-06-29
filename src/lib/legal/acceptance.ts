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

export type LoanDocumentsData = {
  loanId: string;
  buyerUserId: string;
  borrowerName: string;
  borrowerContact: string | null;
  /** ISO date the loan was booked (used as the document date). */
  date: string;
  sellerName: string | null;
  terms: LoanTerms;
  /** The recorded acceptance, if one exists (older loans may have none). */
  acceptance: {
    signatureName: string;
    acceptedAt: string;
    documentVersion: string;
    ipAddress: string | null;
  } | null;
};

/**
 * Everything needed to render a loan's Disclosure Statement + Promissory Note:
 * the borrower, the terms (from the recorded acceptance snapshot when present,
 * else recomputed from the loan), and the acceptance metadata. Returns null if
 * the loan does not exist. Service-role read.
 */
export async function getLoanDocuments(
  loanId: string,
): Promise<LoanDocumentsData | null> {
  const admin = createAdminClient();
  const { data: loan } = await admin
    .from("loans")
    .select(
      "id, buyer_user_id, seller_user_id, ticket_centavos, tenor_months, interest_rate_monthly, processing_fee_centavos, payment_frequency, created_at",
    )
    .eq("id", loanId)
    .maybeSingle();
  if (!loan) return null;

  const [{ data: buyer }, { data: seller }, { data: acc }] = await Promise.all([
    admin
      .from("users")
      .select("name, contact")
      .eq("id", loan.buyer_user_id)
      .maybeSingle(),
    admin
      .from("users")
      .select("name")
      .eq("id", loan.seller_user_id)
      .maybeSingle(),
    admin
      .from("document_acceptances")
      .select("signature_name, accepted_at, document_version, ip_address, terms_snapshot")
      .eq("loan_id", loanId)
      .eq("document_type", "disclosure_statement")
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let terms = (acc?.terms_snapshot as LoanTerms | null) ?? null;
  if (!terms) {
    const penalty = await getConfigValue("penalty_rate_monthly", admin);
    const feePct =
      loan.ticket_centavos > 0
        ? (loan.processing_fee_centavos / loan.ticket_centavos) * 100
        : 0;
    terms = computeLoanTerms({
      principalCentavos: loan.ticket_centavos,
      tenorMonths: loan.tenor_months,
      interestRateMonthly: loan.interest_rate_monthly,
      frequency: loan.payment_frequency,
      processingFeePct: feePct,
      penaltyRateMonthly: penalty,
      startDate: new Date(loan.created_at),
    });
  }

  return {
    loanId: loan.id,
    buyerUserId: loan.buyer_user_id,
    borrowerName: buyer?.name ?? "",
    borrowerContact: buyer?.contact ?? null,
    date: loan.created_at,
    sellerName: seller?.name ?? null,
    terms,
    acceptance: acc
      ? {
          signatureName: acc.signature_name,
          acceptedAt: acc.accepted_at,
          documentVersion: acc.document_version,
          ipAddress: acc.ip_address,
        }
      : null,
  };
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
