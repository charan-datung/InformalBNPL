import { LENDER } from "@/lib/legal/lender";
import type { DocumentParty } from "@/lib/legal/types";
import { formatPeso, formatDate } from "@/lib/format";
import LegalDoc from "@/components/legal/LegalDoc";

function pct(n: number, dp = 2): string {
  return `${n.toFixed(dp)}%`;
}

export type LoanAgreementProps = {
  borrower: DocumentParty;
  date: string;
  /** Approved revolving credit limit; null before underwriting. */
  creditLimitCentavos?: number | null;
  interestRateMonthly: number;
  processingFeePct: number;
  penaltyRateMonthly: number;
  /** Reference for the accepted instance (e.g. acceptance id), shown if present. */
  acceptanceRef?: string | null;
};

/**
 * MASTER CREDIT / LOAN AGREEMENT — accepted once by the borrower at onboarding.
 * It frames the revolving credit relationship; each individual purchase is then
 * a separate loan governed by its own Disclosure Statement and Promissory Note.
 * Includes the Data Privacy Act (RA 10173) consent and electronic-transactions
 * consent (RA 8792) a regulated lender needs on file.
 */
export default function LoanAgreement({
  borrower,
  date,
  creditLimitCentavos,
  interestRateMonthly,
  processingFeePct,
  penaltyRateMonthly,
  acceptanceRef,
}: LoanAgreementProps) {
  return (
    <LegalDoc
      title="Credit Agreement"
      docRef={acceptanceRef ?? undefined}
      date={formatDate(date)}
    >
      <p className="mb-3">
        This Credit Agreement (the “Agreement”) is entered into between{" "}
        <strong>{LENDER.legalName}</strong>, a lending company registered with the
        Securities and Exchange Commission (SEC Reg. No.{" "}
        {LENDER.secRegistrationNo}; Certificate of Authority No.{" "}
        {LENDER.certificateOfAuthorityNo}), operating the {LENDER.brand} service
        (the “Lender”), and <strong>{borrower.name}</strong> (the “Borrower”).
      </p>

      <Section n={1} title="Grant of revolving credit">
        The Lender may extend revolving credit to the Borrower up to the approved
        credit limit
        {creditLimitCentavos != null
          ? ` of ${formatPeso(creditLimitCentavos)}`
          : ""}
        . Each purchase the Borrower chooses to finance becomes a separate loan
        drawn against the available credit and is governed by this Agreement
        together with the Disclosure Statement and Promissory Note issued for that
        loan. Approval of any loan is at the Lender’s sole discretion.
      </Section>

      <Section n={2} title="Interest, fees and charges">
        Loans bear interest at the rate then in effect (currently{" "}
        {pct(interestRateMonthly * 100)} per month, flat) and a one-time
        processing/service fee (currently {pct(processingFeePct)} of principal).
        The exact amounts, the total finance charge, and the Effective Interest
        Rate are disclosed to the Borrower in the Disclosure Statement of each loan
        before it is incurred, in accordance with the Truth in Lending Act (RA
        3765). All charges are within the ceilings prescribed by SEC rules for
        covered short-term loans.
      </Section>

      <Section n={3} title="Repayment and default">
        The Borrower shall pay each installment on its due date. Amounts not paid
        when due incur a penalty of {pct(penaltyRateMonthly * 100)} per month until
        paid. On default, the Lender may declare the entire balance of the
        affected loan immediately due, suspend further credit, and pursue lawful
        collection. Payments are applied first to penalties, then to the finance
        charge, then to principal.
      </Section>

      <Section n={4} title="Borrower representations">
        The Borrower represents that they are at least 18 years old, that the
        information provided is true and complete, and that they have the capacity
        to enter into this Agreement.
      </Section>

      <Section n={5} title="Data privacy consent (RA 10173)">
        The Borrower consents to the Lender’s collection, use, storage, and
        processing of their personal and sensitive personal information for credit
        evaluation, identity verification, account servicing, collection, fraud
        prevention, and compliance with legal and regulatory requirements; and to
        its sharing with credit bureaus, service providers, and regulators where
        permitted or required by law. The information collected includes: identity
        and contact details; government ID and proof of billing; financial,
        transaction, and repayment data; device and technical information; the
        Borrower’s device location, captured only when the Borrower grants location
        permission — at sign-up, at seller onboarding, and at the time of each
        purchase — and used to verify the account and to detect and prevent fraud;
        and character references the Borrower voluntarily provides, including any
        contacts the Borrower individually selects to share through their device’s
        own contact picker. The Lender does not read or upload the Borrower’s phone
        contact list; only the specific entries the Borrower chooses to share are
        collected. Granting device location and contact-sharing is optional: the
        Borrower may decline or later withdraw either consent — without losing
        access to credit already granted — and may exercise their rights to be
        informed, to access, to correct, to object, and to erasure or blocking
        under the Data Privacy Act by contacting {LENDER.noticesEmail}.
      </Section>

      <Section n={6} title="Electronic transactions (RA 8792)">
        The Borrower agrees that acceptance of this Agreement and of any loan
        document through the {LENDER.brand} application — including recorded
        click-acceptance, a typed-name signature, the date and time, and the
        device’s network address — constitutes a valid, binding, and enforceable
        signature equivalent to a handwritten one.
      </Section>

      <Section n={7} title="Notices and amendments">
        Notices to the Borrower may be sent through the {LENDER.brand} application
        or to the contact details on file. The Lender may amend the rates and fees
        prospectively; any change applies only to loans incurred after the change
        and after disclosure to the Borrower.
      </Section>

      <Section n={8} title="Governing law and venue">
        This Agreement is governed by the laws of the Republic of the Philippines.
        Any dispute shall be brought exclusively before the proper courts of{" "}
        {LENDER.governingVenueCity}.
      </Section>

      <p className="mt-6 text-[12px]">
        By accepting below, the Borrower acknowledges having read and understood
        this Agreement and agrees to be bound by it.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-8 text-[12px]">
        <div>
          <div className="mt-6 border-t border-black/50 pt-1 font-medium">
            {borrower.name}
          </div>
          <div className="text-[11px] text-black/60">Borrower</div>
        </div>
        <div>
          <div className="mt-6 border-t border-black/50 pt-1 font-medium">
            {LENDER.signatoryName}
          </div>
          <div className="text-[11px] text-black/60">For the Lender</div>
          <div className="text-[11px] text-black/60">{LENDER.signatoryTitle}</div>
        </div>
      </div>
    </LegalDoc>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <h2 className="mb-1 text-sm font-bold">
        {n}. {title}
      </h2>
      <p>{children}</p>
    </div>
  );
}
