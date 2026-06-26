import { LENDER } from "@/lib/legal/lender";
import type { LoanDocData } from "@/lib/legal/types";
import { formatPeso, formatDate } from "@/lib/format";
import LegalDoc from "@/components/legal/LegalDoc";

function pct(n: number, dp = 2): string {
  return `${n.toFixed(dp)}%`;
}

/**
 * PROMISSORY NOTE — the borrower's unconditional promise to pay the total amount
 * payable per the disclosed schedule, with the penalty, acceleration and venue
 * terms a lending company relies on to enforce the obligation. Mirrors the
 * figures in the Disclosure Statement.
 */
export default function PromissoryNote({ data }: { data: LoanDocData }) {
  const t = data.terms;
  return (
    <LegalDoc title="Promissory Note" docRef={data.loanRef} date={formatDate(data.date)}>
      <p className="mb-3">
        FOR VALUE RECEIVED, I, <strong>{data.borrower.name}</strong>
        {data.borrower.address ? `, of ${data.borrower.address}` : ""} (the
        “Borrower”), unconditionally promise to pay to the order of{" "}
        <strong>{LENDER.legalName}</strong> (the “Lender”), at its office at{" "}
        {LENDER.registeredAddress} or such other place as the Lender may
        designate, the sum of{" "}
        <strong>{formatPeso(t.totalPayableCentavos)}</strong>, being the loan
        principal of {formatPeso(t.loanAmountCentavos)} (which includes a
        capitalized processing/service fee of {formatPeso(t.processingFeeCentavos)}{" "}
        added to the {formatPeso(t.amountFinancedCentavos)} purchase) plus interest
        of {formatPeso(t.totalInterestCentavos)}, payable in {t.periods}{" "}
        {t.frequency === "biweekly" ? "bi-weekly" : "monthly"} installment
        {t.periods === 1 ? "" : "s"} in accordance with the schedule below.
      </p>

      <ol className="ml-4 list-decimal space-y-2">
        <li>
          <strong>Interest.</strong> The loan bears interest at{" "}
          {pct(t.nominalRateMonthlyPct)} per month (flat) on the principal for the
          {` ${t.tenorMonths}`}-month term, with an Effective Interest Rate of{" "}
          {pct(t.eirMonthlyPct)} per month ({pct(t.eirAnnualPct)} per year),
          inclusive of the processing/service fee of{" "}
          {formatPeso(t.processingFeeCentavos)}.
        </li>
        <li>
          <strong>Installments.</strong> I shall pay as follows:
          <table className="mt-2 w-full text-[12px]">
            <thead>
              <tr className="border-b border-black/30 text-left">
                <th className="py-1 pr-3 font-semibold">#</th>
                <th className="py-1 pr-3 font-semibold">Due date</th>
                <th className="py-1 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {t.installments.map((r) => (
                <tr key={r.index} className="border-b border-black/10">
                  <td className="py-1 pr-3">{r.index}</td>
                  <td className="py-1 pr-3 tabular-nums">
                    {formatDate(r.dueDate)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatPeso(r.amountCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </li>
        <li>
          <strong>Penalty on default.</strong> Any installment not paid on its due
          date shall incur a penalty of {pct(t.penaltyRateMonthly * 100)} per month
          on the unpaid amount until fully paid, without prejudice to the Lender’s
          other remedies.
        </li>
        <li>
          <strong>Acceleration.</strong> Upon my failure to pay any installment
          when due, the entire unpaid balance of this Note shall, at the Lender’s
          option, become immediately due and demandable without need of further
          notice or demand, which I hereby expressly waive.
        </li>
        <li>
          <strong>Application of payments.</strong> Payments shall be applied first
          to penalties, then to the finance charge, then to principal.
        </li>
        <li>
          <strong>Venue.</strong> Any action arising from this Note shall be
          brought exclusively before the proper courts of{" "}
          {LENDER.governingVenueCity}, to the exclusion of all other venues.
        </li>
        <li>
          <strong>Electronic acceptance.</strong> I agree that my acceptance of
          this Note through the {LENDER.brand} application, including any recorded
          click-acceptance or typed signature, constitutes my valid and binding
          signature under the Electronic Commerce Act (RA 8792).
        </li>
      </ol>

      <p className="mt-4">
        Signed this {formatDate(data.date)} at {LENDER.governingVenueCity}.
      </p>

      <div className="mt-8 text-[12px]">
        <div className="mt-6 inline-block border-t border-black/50 pt-1 font-medium">
          {data.borrower.name}
        </div>
        <div className="text-[11px] text-black/60">Borrower</div>
        {data.borrower.contact ? (
          <div className="text-[11px] text-black/60">
            Contact: {data.borrower.contact}
          </div>
        ) : null}
      </div>
    </LegalDoc>
  );
}
