/**
 * Single source of truth for the LENDER's legal identity, used to populate every
 * borrower-facing legal document (Disclosure Statement, Promissory Note, Loan /
 * Credit Agreement). Keeping it here means a detail only ever changes in one
 * place and every document stays consistent.
 *
 * Datung is the consumer brand; the lender of record is the SEC-registered
 * financing/lending company below. Figures the borrower is charged (interest,
 * processing fee, penalty) live in system_config, NOT here — this file is
 * identity only.
 *
 * NOTE: fields marked `CONFIRM` are placeholders awaiting the official value.
 * They are intentionally obvious so an unconfirmed document is easy to spot.
 */
export const LENDER = {
  /** Consumer-facing brand/app name. */
  brand: "Datung",
  /** Registered corporate name (the lender of record / payee on documents). */
  legalName: "Dark Knight Lending, Inc.",
  /** Former corporate name, per the SEC amended articles. */
  formerName: "Dark Knight Analytics, Inc.",
  /** SEC Company Registration Number. */
  secRegistrationNo: "2024070157507-01",
  /** SEC Certificate of Authority to operate as a lending company. */
  certificateOfAuthorityNo: "3506",

  /** Registered principal office. CONFIRM the exact registered address. */
  registeredAddress: "CONFIRM — registered office address, City, Philippines",
  /** Email used for official notices to/from borrowers. CONFIRM. */
  noticesEmail: "CONFIRM — official email",
  /** Phone/hotline for borrower support. CONFIRM. */
  contactPhone: "CONFIRM — contact number",
  /** City whose courts govern disputes (venue clause). CONFIRM. */
  governingVenueCity: "CONFIRM — city",

  /** Authorized signatory for the lender on agreements. CONFIRM name + title. */
  signatoryName: "CONFIRM — authorized signatory",
  signatoryTitle: "CONFIRM — title",

  /** Where borrowers remit repayments (mirrors repayment-details.ts). */
  remittance: {
    bankName: "Asia United Bank",
    accountName: "Dark Knight Lending Inc",
    accountNumber: "097010001403",
  },
} as const;

/** True when any CONFIRM placeholder is still present — surfaced in previews. */
export function lenderHasPlaceholders(): boolean {
  return JSON.stringify(LENDER).includes("CONFIRM");
}
