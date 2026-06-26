import type { LoanTerms } from "@/lib/loans/finance";

/** A named party on a legal document. */
export type DocumentParty = {
  name: string;
  address?: string | null;
  contact?: string | null;
};

/**
 * Everything a per-loan legal document needs that isn't the lender's own
 * identity (that comes from LENDER) or the computed money (that comes from
 * LoanTerms). Assembled once and handed to each document template.
 */
export type LoanDocData = {
  /** Human-readable loan reference (e.g. the loan id or a short code). */
  loanRef: string;
  /** Date the document is generated / the loan is consummated (YYYY-MM-DD). */
  date: string;
  borrower: DocumentParty;
  terms: LoanTerms;
  /** What the credit financed, e.g. "Purchase from Aling Nena's Store". */
  purchaseDescription?: string | null;
};
