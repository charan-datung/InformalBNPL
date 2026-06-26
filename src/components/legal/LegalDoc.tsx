import type { ReactNode } from "react";
import { LENDER, lenderHasPlaceholders } from "@/lib/legal/lender";
import PrintButton from "@/components/legal/PrintButton";

/**
 * Print-friendly chrome shared by every legal document: the lender letterhead
 * (corporate name, SEC registration + Certificate of Authority — required on a
 * lending company's documents), the document title/reference, a print button,
 * and a placeholder warning while any LENDER field is still unconfirmed.
 *
 * Screen styling is kept restrained and document-like; `print:` utilities strip
 * the surrounding app so a printed/PDF copy is clean.
 */
export default function LegalDoc({
  title,
  docRef,
  date,
  children,
}: {
  title: string;
  docRef?: string;
  date?: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl bg-white px-6 py-8 text-[13px] leading-relaxed text-black sm:px-10 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex items-start justify-between gap-4">
        <header>
          <div className="text-base font-bold uppercase tracking-wide">
            {LENDER.legalName}
          </div>
          <div className="text-[11px] text-black/60">
            SEC Reg. No. {LENDER.secRegistrationNo} · Certificate of Authority
            No. {LENDER.certificateOfAuthorityNo}
          </div>
          <div className="text-[11px] text-black/60">
            {LENDER.registeredAddress}
          </div>
          <div className="text-[11px] text-black/60">
            {LENDER.noticesEmail}
            {LENDER.contactPhone ? ` · ${LENDER.contactPhone}` : ""}
          </div>
        </header>
        <div className="print:hidden">
          <PrintButton />
        </div>
      </div>

      {lenderHasPlaceholders() ? (
        <p className="mb-5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 print:hidden">
          Draft — some lender details still show “CONFIRM”. Fill them in{" "}
          <code>src/lib/legal/lender.ts</code> before issuing this to a borrower.
          This template should also be reviewed by counsel.
        </p>
      ) : null}

      <div className="mb-5 border-y border-black/20 py-3 text-center">
        <h1 className="text-lg font-bold uppercase tracking-wide">{title}</h1>
        <div className="mt-0.5 text-[11px] text-black/60">
          {docRef ? <span>Ref: {docRef}</span> : null}
          {docRef && date ? <span> · </span> : null}
          {date ? <span>Dated: {date}</span> : null}
        </div>
      </div>

      {children}
    </article>
  );
}

/** A labeled figure row for the money tables in the disclosure. */
export function MoneyRow({
  label,
  value,
  strong,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 border-b border-black/10 py-1.5 ${
        strong ? "font-semibold" : ""
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
