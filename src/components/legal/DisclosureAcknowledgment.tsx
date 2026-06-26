"use client";

import type { LoanTerms } from "@/lib/loans/finance";
import { LENDER } from "@/lib/legal/lender";
import { formatPeso } from "@/lib/format";

/**
 * The pre-consummation disclosure shown at checkout: the loan's key terms (per
 * the Disclosure Statement), an agree checkbox, and a typed-name e-signature.
 * The enclosing <form> posts `agree` + `signature`, which the server action
 * validates and records as the borrower's acceptance.
 */
function pct(n: number): string {
  return `${n.toFixed(2)}%`;
}

export default function DisclosureAcknowledgment({ terms }: { terms: LoanTerms }) {
  return (
    <div className="space-y-2 rounded-xl border border-black/10 bg-black/[0.015] p-3 text-[12px] dark:border-white/10">
      <div className="text-[13px] font-semibold">Key terms (Disclosure Statement)</div>
      <dl className="space-y-1">
        <Row k="Amount financed" v={formatPeso(terms.amountFinancedCentavos)} />
        <Row
          k={`Processing fee (${pct(terms.processingFeePct)})`}
          v={formatPeso(terms.processingFeeCentavos)}
        />
        <Row k="Loan amount (principal)" v={formatPeso(terms.loanAmountCentavos)} />
        <Row
          k="Interest + fees (finance charge)"
          v={formatPeso(terms.financeChargeCentavos)}
        />
        <Row k="Effective interest rate" v={`${pct(terms.eirMonthlyPct)}/mo`} />
        <Row k="Total to pay" v={formatPeso(terms.totalPayableCentavos)} strong />
        <Row
          k="Penalty if late"
          v={`${pct(terms.penaltyRateMonthly * 100)}/mo on overdue`}
        />
      </dl>

      <label className="flex items-start gap-2 pt-1">
        <input type="checkbox" name="agree" required className="mt-0.5" />
        <span>
          I have read and agree to the <strong>Disclosure Statement</strong>,{" "}
          <strong>Promissory Note</strong> and <strong>Credit Agreement</strong>{" "}
          from {LENDER.legalName}.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-black/55 dark:text-white/55">
          Type your full name to sign
        </span>
        <input
          type="text"
          name="signature"
          required
          autoComplete="name"
          placeholder="Your full name"
          className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
        />
      </label>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <dt className="text-black/55 dark:text-white/55">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
