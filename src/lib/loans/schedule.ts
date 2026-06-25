/**
 * Repayment schedule math — flat interest on principal, fixed by the loan's
 * tenor in MONTHS. The payment *frequency* only changes how many installments
 * the same total is split into, and how far apart they fall — never the total
 * cost. This MUST stay in lockstep with the `start_repayment` SQL function
 * (migration 0007, amended for frequency) so the preview a buyer sees at
 * checkout matches the schedule generated when the loan later enters `repaying`.
 *
 *   monthly_interest = round(ticket * monthlyRate)
 *   total_interest   = monthly_interest * tenorMonths   // duration-based
 *   total            = ticket + total_interest
 *   periods          = monthly ? tenorMonths : tenorMonths * 2   // biweekly = 2/mo
 *   base             = floor(total / periods)            // each installment
 *   last             = total - base * (periods - 1)      // absorbs remainder
 *
 * Due dates step by one month (monthly) or 14 days (biweekly). A biweekly plan
 * over the same tenor therefore costs exactly the same as monthly — it is just
 * paid in twice as many, smaller, closer-together installments.
 *
 * All amounts are integer centavos.
 */

export type PaymentFrequency = "monthly" | "biweekly";

export type Installment = {
  index: number;
  principalCentavos: number;
  interestCentavos: number;
  amountCentavos: number;
  dueDate: string; // YYYY-MM-DD
};

export type Schedule = {
  installments: Installment[];
  totalCentavos: number;
  interestCentavos: number;
  monthlyInterestCentavos: number;
};

/** Number of installments for a tenor + frequency. Biweekly = 2 per month. */
export function periodCount(
  tenorMonths: number,
  frequency: PaymentFrequency,
): number {
  return frequency === "biweekly" ? tenorMonths * 2 : tenorMonths;
}

export function computeSchedule(
  ticketCentavos: number,
  tenorMonths: number,
  monthlyRate: number,
  frequency: PaymentFrequency = "monthly",
  startDate: Date = new Date(),
): Schedule {
  if (
    !Number.isFinite(ticketCentavos) ||
    ticketCentavos <= 0 ||
    !Number.isInteger(tenorMonths) ||
    tenorMonths <= 0
  ) {
    return {
      installments: [],
      totalCentavos: 0,
      interestCentavos: 0,
      monthlyInterestCentavos: 0,
    };
  }

  const monthlyInterest = Math.round(ticketCentavos * monthlyRate);
  const totalInterest = monthlyInterest * tenorMonths;
  const total = ticketCentavos + totalInterest;

  const periods = periodCount(tenorMonths, frequency);
  const baseAmount = Math.floor(total / periods);
  const baseInterest = Math.floor(totalInterest / periods);

  const installments: Installment[] = [];
  for (let i = 1; i <= periods; i++) {
    const isLast = i === periods;
    // The last installment absorbs the rounding remainder so the parts sum
    // exactly to the total (amount) and the ticket (principal).
    const amount = isLast ? total - baseAmount * (periods - 1) : baseAmount;
    const interest = isLast
      ? totalInterest - baseInterest * (periods - 1)
      : baseInterest;

    const due = new Date(startDate);
    if (frequency === "biweekly") {
      due.setDate(due.getDate() + i * 14);
    } else {
      due.setMonth(due.getMonth() + i);
    }

    installments.push({
      index: i,
      interestCentavos: interest,
      principalCentavos: amount - interest,
      amountCentavos: amount,
      dueDate: due.toISOString().slice(0, 10),
    });
  }

  return {
    installments,
    totalCentavos: total,
    interestCentavos: totalInterest,
    monthlyInterestCentavos: monthlyInterest,
  };
}
