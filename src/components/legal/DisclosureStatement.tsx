import { LENDER } from "@/lib/legal/lender";
import type { LoanDocData } from "@/lib/legal/types";
import { formatPeso, formatDate } from "@/lib/format";
import LegalDoc, { MoneyRow } from "@/components/legal/LegalDoc";

/** Format a percent value compactly, e.g. 3.5 -> "3.50%". */
function pct(n: number, dp = 2): string {
  return `${n.toFixed(dp)}%`;
}

/**
 * DISCLOSURE STATEMENT — the Truth in Lending Act (RA 3765) disclosure given to
 * the borrower BEFORE the credit is consummated. Lays out, in pesos, the amount
 * financed, the itemized finance charge, the total to be paid, the nominal rate
 * AND the effective interest rate (EIR), the full payment schedule, and the
 * penalty for default — so the borrower knows the true cost of the credit.
 */
export default function DisclosureStatement({ data }: { data: LoanDocData }) {
  const t = data.terms;
  return (
    <LegalDoc
      title="Disclosure Statement"
      docRef={data.loanRef}
      date={formatDate(data.date)}
    >
      <p className="mb-3">
        Pursuant to Republic Act No. 3765 (Truth in Lending Act) and the rules of
        the Securities and Exchange Commission, {LENDER.legalName} (the
        “Lender”), operating the {LENDER.brand} service, discloses to{" "}
        <strong>{data.borrower.name}</strong> (the “Borrower”) the true cost of
        the credit extended under this transaction.
      </p>

      {data.purchaseDescription ? (
        <p className="mb-3">
          <span className="text-black/60">Transaction: </span>
          {data.purchaseDescription}
        </p>
      ) : null}

      <h2 className="mt-5 mb-1 text-sm font-bold uppercase">
        1. Amount of the credit
      </h2>
      <MoneyRow
        label="Principal / Amount Financed (cash value received)"
        value={formatPeso(t.principalCentavos)}
        strong
      />

      <h2 className="mt-5 mb-1 text-sm font-bold uppercase">
        2. Finance charge
      </h2>
      <MoneyRow
        label={`Interest (${pct(t.nominalRateMonthlyPct)}/month flat × ${t.tenorMonths} month${
          t.tenorMonths === 1 ? "" : "s"
        })`}
        value={formatPeso(t.totalInterestCentavos)}
      />
      <MoneyRow
        label={`Processing / service fee (${pct(t.processingFeePct)} of principal, one-time)`}
        value={formatPeso(t.processingFeeCentavos)}
      />
      <MoneyRow
        label="Total Finance Charge"
        value={formatPeso(t.financeChargeCentavos)}
        strong
      />

      <h2 className="mt-5 mb-1 text-sm font-bold uppercase">
        3. Total amount to be paid
      </h2>
      <MoneyRow
        label="Total Amount Payable (principal + finance charge)"
        value={formatPeso(t.totalPayableCentavos)}
        strong
      />

      <h2 className="mt-5 mb-1 text-sm font-bold uppercase">
        4. Interest rates
      </h2>
      <MoneyRow
        label="Nominal interest rate"
        value={`${pct(t.nominalRateMonthlyPct)}/month (${pct(t.nominalRateAnnualPct)}/year)`}
      />
      <MoneyRow
        label="Effective Interest Rate (EIR)"
        value={`${pct(t.eirMonthlyPct)}/month (${pct(t.eirAnnualPct)}/year)`}
        strong
      />
      <p className="mt-1 text-[11px] text-black/55">
        The EIR reflects interest and the processing fee over the actual payment
        schedule and is therefore higher than the flat nominal rate.
      </p>

      <h2 className="mt-5 mb-1 text-sm font-bold uppercase">
        5. Schedule of payments
      </h2>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-black/30 text-left">
            <th className="py-1 pr-3 font-semibold">#</th>
            <th className="py-1 pr-3 font-semibold">Due date</th>
            <th className="py-1 pr-3 text-right font-semibold">Principal</th>
            <th className="py-1 pr-3 text-right font-semibold">Finance charge</th>
            <th className="py-1 text-right font-semibold">Amount due</th>
          </tr>
        </thead>
        <tbody>
          {t.installments.map((r) => (
            <tr key={r.index} className="border-b border-black/10">
              <td className="py-1 pr-3">{r.index}</td>
              <td className="py-1 pr-3 tabular-nums">{formatDate(r.dueDate)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">
                {formatPeso(r.principalCentavos)}
              </td>
              <td className="py-1 pr-3 text-right tabular-nums">
                {formatPeso(r.financeChargeCentavos)}
              </td>
              <td className="py-1 text-right font-medium tabular-nums">
                {formatPeso(r.amountCentavos)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="py-1.5 pr-3" colSpan={4}>
              Total
            </td>
            <td className="py-1.5 text-right tabular-nums">
              {formatPeso(t.totalPayableCentavos)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-1 text-[11px] text-black/55">
        Payments are made to {LENDER.remittance.bankName} ·{" "}
        {LENDER.remittance.accountName} · {LENDER.remittance.accountNumber}, or
        via the {LENDER.brand} payment QR. Each payment is recorded when received.
      </p>

      <h2 className="mt-5 mb-1 text-sm font-bold uppercase">6. Other charges</h2>
      <p>
        A penalty of {pct(t.penaltyRateMonthly * 100)} per month is charged on any
        amount not paid on its due date, computed until the overdue amount is
        fully paid. There are <strong>no other charges</strong> — no hidden fees,
        no collection or handling charges beyond those stated above.
      </p>

      <p className="mt-6 text-[12px]">
        I acknowledge that the foregoing was disclosed to me before I incurred
        this obligation, that I read and understood it, and that I agree to the
        terms of the credit.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-8 text-[12px]">
        <SignatureBlock role="Borrower" name={data.borrower.name} />
        <SignatureBlock
          role="For the Lender"
          name={LENDER.signatoryName}
          sub={LENDER.signatoryTitle}
        />
      </div>
    </LegalDoc>
  );
}

function SignatureBlock({
  role,
  name,
  sub,
}: {
  role: string;
  name: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="mt-6 border-t border-black/50 pt-1 font-medium">{name}</div>
      <div className="text-[11px] text-black/60">{role}</div>
      {sub ? <div className="text-[11px] text-black/60">{sub}</div> : null}
    </div>
  );
}
