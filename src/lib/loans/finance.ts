import type { PaymentFrequency } from "@/lib/loans/schedule";

/**
 * Finance-charge + disclosure math for a single loan — the numbers that go on
 * the Truth-in-Lending Disclosure Statement (RA 3765), the Promissory Note, and
 * the Loan Agreement. Pure and unit-tested; no I/O.
 *
 * Cost model (all integer centavos). The processing fee is CAPITALIZED — added
 * on top of the purchase to form a higher loan principal, and interest accrues
 * on that fee-inclusive principal:
 *   amount_financed  = purchase price (cash value the borrower receives)
 *   processing_fee   = round(amount_financed * processingFeePct/100)  (one-time)
 *   loan_amount      = amount_financed + processing_fee        (the principal)
 *   monthly_interest = round(loan_amount * interestRateMonthly)
 *   total_interest   = monthly_interest * tenorMonths          (flat, duration-based)
 *   finance_charge   = processing_fee + total_interest         (true cost of credit)
 *   total_payable    = loan_amount + total_interest
 *   periods          = monthly ? tenor : tenor * 2
 *   each installment = floor(total_payable / periods); last absorbs remainder
 *
 * Payment frequency only splits the SAME total into more, closer installments —
 * it never changes the cost. Due dates step by whole months or 14 days.
 *
 * Dates are computed in UTC (calendar-date arithmetic) so this preview matches
 * the SQL `start_repayment` generator regardless of server timezone.
 */

export type DisclosureInstallment = {
  index: number;
  /** YYYY-MM-DD (UTC calendar date). */
  dueDate: string;
  /** Whole days from disbursement to this due date (used for the EIR/IRR). */
  dayOffset: number;
  amountCentavos: number;
  /** Portion of this installment that repays the loan principal. */
  principalCentavos: number;
  /** Portion that is interest. */
  interestCentavos: number;
};

export type LoanTerms = {
  /** Cash value of the purchase the borrower receives. */
  amountFinancedCentavos: number;
  /** Loan principal = amount financed + capitalized processing fee. */
  loanAmountCentavos: number;
  tenorMonths: number;
  frequency: PaymentFrequency;
  periods: number;

  interestRateMonthly: number;
  processingFeePct: number;
  penaltyRateMonthly: number;

  monthlyInterestCentavos: number;
  totalInterestCentavos: number;
  processingFeeCentavos: number;
  /** Total cost of credit = processing fee + total interest. */
  financeChargeCentavos: number;
  totalPayableCentavos: number;

  installments: DisclosureInstallment[];
  firstDueDate: string | null;
  lastDueDate: string | null;

  /** Contractual nominal rate, monthly and annualized (rate × 12). */
  nominalRateMonthlyPct: number;
  nominalRateAnnualPct: number;
  /** Effective interest rate (RA 3765) — annual and monthly-equivalent. */
  eirAnnualPct: number;
  eirMonthlyPct: number;
};

export type LoanTermsInput = {
  /** Purchase price / cash value financed, BEFORE the capitalized processing fee. */
  principalCentavos: number;
  tenorMonths: number;
  interestRateMonthly: number;
  frequency?: PaymentFrequency;
  processingFeePct?: number;
  penaltyRateMonthly?: number;
  /** Disbursement date; defaults to "now". Only its UTC calendar date is used. */
  startDate?: Date;
};

/** A whole number of UTC days between two dates. */
function daysBetweenUTC(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

/** Add whole months to a UTC calendar date; returns YYYY-MM-DD + the Date. */
function addMonthsUTC(base: Date, n: number): Date {
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + n, base.getUTCDate()),
  );
}

function addDaysUTC(base: Date, n: number): Date {
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + n),
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Effective annual interest rate via a day-based IRR (XIRR-style): the rate at
 * which the present value of all installments equals the amount the borrower
 * actually receives (the principal — the finance charge is a cost, not received).
 * Handles monthly and biweekly uniformly because it discounts by actual days.
 */
export function effectiveAnnualRate(
  principalCentavos: number,
  installments: { amountCentavos: number; dayOffset: number }[],
): number {
  if (principalCentavos <= 0 || installments.length === 0) return 0;
  const npv = (annualRate: number) =>
    installments.reduce(
      (sum, it) =>
        sum + it.amountCentavos / Math.pow(1 + annualRate, it.dayOffset / 365),
      0,
    ) - principalCentavos;

  // No finance charge (payments ≤ principal) → 0% effective.
  if (npv(0) <= 0) return 0;

  // NPV is monotonically decreasing in the rate; bisect to the root.
  let lo = 0;
  let hi = 100; // 10,000%/yr — far above any conceivable EIR
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (Math.abs(v) < 1e-6) return mid;
    if (v > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Penalty accrued on a single overdue installment, prorated by day at the monthly
 * penalty rate (so it grows continuously until paid, per the Promissory Note).
 * Returns 0 when not yet overdue. Dates are YYYY-MM-DD (UTC calendar days).
 */
export function installmentPenaltyCentavos(input: {
  amountCentavos: number;
  dueDate: string;
  todayIso: string;
  penaltyRateMonthly: number;
}): number {
  const due = Date.parse(`${input.dueDate}T00:00:00Z`);
  const today = Date.parse(`${input.todayIso}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(today) || today <= due) return 0;
  const daysLate = Math.round((today - due) / 86_400_000);
  return Math.round(
    input.amountCentavos * input.penaltyRateMonthly * (daysLate / 30),
  );
}

export function computeLoanTerms(input: LoanTermsInput): LoanTerms {
  const frequency: PaymentFrequency =
    input.frequency === "biweekly" ? "biweekly" : "monthly";
  const processingFeePct = input.processingFeePct ?? 0;
  const penaltyRateMonthly = input.penaltyRateMonthly ?? 0;
  const amountFinanced = Math.max(0, Math.round(input.principalCentavos));
  const tenorMonths = Math.max(0, Math.trunc(input.tenorMonths));
  const start = input.startDate ?? new Date();

  // Processing fee is capitalized into a higher loan principal; interest then
  // accrues on that fee-inclusive principal.
  const processingFee = Math.round((amountFinanced * processingFeePct) / 100);
  const loanAmount = amountFinanced + processingFee;
  const monthlyInterest = Math.round(loanAmount * input.interestRateMonthly);
  const totalInterest = monthlyInterest * tenorMonths;
  const financeCharge = processingFee + totalInterest;
  const totalPayable = loanAmount + totalInterest;
  const periods = frequency === "biweekly" ? tenorMonths * 2 : tenorMonths;

  const installments: DisclosureInstallment[] = [];
  if (periods > 0 && loanAmount > 0) {
    const baseAmount = Math.floor(totalPayable / periods);
    const baseInterest = Math.floor(totalInterest / periods);
    for (let i = 1; i <= periods; i++) {
      const isLast = i === periods;
      const amount = isLast
        ? totalPayable - baseAmount * (periods - 1)
        : baseAmount;
      const interestShare = isLast
        ? totalInterest - baseInterest * (periods - 1)
        : baseInterest;
      const due =
        frequency === "biweekly"
          ? addDaysUTC(start, i * 14)
          : addMonthsUTC(start, i);
      installments.push({
        index: i,
        dueDate: isoDate(due),
        dayOffset: daysBetweenUTC(start, due),
        amountCentavos: amount,
        interestCentavos: interestShare,
        principalCentavos: amount - interestShare,
      });
    }
  }

  // EIR discounts the payments back to the CASH the borrower received (the
  // amount financed) — the capitalized fee is a cost, so it raises the EIR.
  const eirAnnual = effectiveAnnualRate(amountFinanced, installments);

  return {
    amountFinancedCentavos: amountFinanced,
    loanAmountCentavos: loanAmount,
    tenorMonths,
    frequency,
    periods,
    interestRateMonthly: input.interestRateMonthly,
    processingFeePct,
    penaltyRateMonthly,
    monthlyInterestCentavos: monthlyInterest,
    totalInterestCentavos: totalInterest,
    processingFeeCentavos: processingFee,
    financeChargeCentavos: financeCharge,
    totalPayableCentavos: totalPayable,
    installments,
    firstDueDate: installments[0]?.dueDate ?? null,
    lastDueDate: installments[installments.length - 1]?.dueDate ?? null,
    nominalRateMonthlyPct: input.interestRateMonthly * 100,
    nominalRateAnnualPct: input.interestRateMonthly * 12 * 100,
    eirAnnualPct: eirAnnual * 100,
    // Monthly-equivalent of the effective annual rate, for the MC 3-2022 view.
    eirMonthlyPct: (Math.pow(1 + eirAnnual, 1 / 12) - 1) * 100,
  };
}
