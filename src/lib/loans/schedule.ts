/**
 * Repayment schedule math — flat monthly interest on principal. This MUST stay
 * in lockstep with the `start_repayment` SQL function (migration 0007) so the
 * preview a buyer sees at checkout matches the schedule generated when the loan
 * later enters `repaying`.
 *
 *   monthly_interest = round(ticket * monthlyRate)
 *   total            = ticket + monthly_interest * tenor
 *   base             = floor(total / tenor)            // each installment
 *   last             = total - base * (tenor - 1)      // absorbs remainder
 *
 * All amounts are integer centavos.
 */

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

export function computeSchedule(
  ticketCentavos: number,
  tenorMonths: number,
  monthlyRate: number,
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
  const total = ticketCentavos + monthlyInterest * tenorMonths;
  const base = Math.floor(total / tenorMonths);

  const installments: Installment[] = [];
  for (let i = 1; i <= tenorMonths; i++) {
    const amount = i < tenorMonths ? base : total - base * (tenorMonths - 1);
    const due = new Date(startDate);
    due.setMonth(due.getMonth() + i);
    installments.push({
      index: i,
      interestCentavos: monthlyInterest,
      principalCentavos: amount - monthlyInterest,
      amountCentavos: amount,
      dueDate: due.toISOString().slice(0, 10),
    });
  }

  return {
    installments,
    totalCentavos: total,
    interestCentavos: monthlyInterest * tenorMonths,
    monthlyInterestCentavos: monthlyInterest,
  };
}
