import type { BuyerLoanView, SellerLoanView } from "@/lib/loans/views";
import { RELEASED_STATUSES } from "@/lib/loans/credit";
import { installmentPenaltyCentavos } from "@/lib/loans/finance";

/**
 * Pure, unit-testable summaries derived from the buyer/seller dashboard views.
 * These power the headline stat tiles and the unified payment/payout panels.
 * No I/O — the dashboards fetch the rows, then hand them here. "today"/"month"
 * are passed in so the math is deterministic and testable.
 */

export type UpcomingPayment = {
  loanId: string;
  sellerName: string;
  amountCentavos: number;
  dueDate: string;
  overdue: boolean;
  /** Penalty accrued so far if overdue (0 otherwise). */
  penaltyCentavos: number;
};

export type BuyerStats = {
  /** Orders still tying up the credit line (not settled/refunded). */
  activeOrders: number;
  /** Orders fully settled. */
  completedOrders: number;
  /** Sum of every unpaid, non-waived installment. */
  totalOwedCentavos: number;
  /** Sum of every installment already paid. */
  totalPaidCentavos: number;
  installmentsPaid: number;
  /** Non-waived installments (paid + open). */
  installmentsTotal: number;
  /** Share of paid installments that landed on or before the due date. */
  onTimePct: number | null;
  /** The single most urgent unpaid installment. */
  nextPayment: UpcomingPayment | null;
  /** All unpaid installments, soonest first. */
  upcoming: UpcomingPayment[];
  overdueCount: number;
  /** Total penalty accrued across all overdue installments. */
  totalPenaltyCentavos: number;
};

/**
 * `todayIso` is a YYYY-MM-DD date string (used for the overdue comparison).
 * `penaltyRateMonthly` accrues a prorated penalty on overdue installments.
 */
export function buyerStats(
  loans: BuyerLoanView[],
  todayIso: string,
  penaltyRateMonthly = 0,
): BuyerStats {
  let totalOwed = 0;
  let totalPaid = 0;
  let paidCount = 0;
  let totalCount = 0;
  let onTime = 0;
  let totalPenalty = 0;
  const upcoming: UpcomingPayment[] = [];

  for (const l of loans) {
    for (const r of l.repayments) {
      if (r.status === "waived") continue;
      totalCount += 1;

      if (r.status === "paid") {
        totalPaid += r.amount_centavos;
        paidCount += 1;
        // paid_at is a timestamp; compare its date part to the due date.
        if (r.paid_at && r.paid_at.slice(0, 10) <= r.due_date) onTime += 1;
      } else {
        totalOwed += r.amount_centavos;
        const penalty = installmentPenaltyCentavos({
          amountCentavos: r.amount_centavos,
          dueDate: r.due_date,
          todayIso,
          penaltyRateMonthly,
        });
        totalPenalty += penalty;
        upcoming.push({
          loanId: l.id,
          sellerName: l.sellerName,
          amountCentavos: r.amount_centavos,
          dueDate: r.due_date,
          overdue: r.due_date < todayIso,
          penaltyCentavos: penalty,
        });
      }
    }
  }

  upcoming.sort((a, b) =>
    a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0,
  );

  return {
    activeOrders: loans.filter((l) => !RELEASED_STATUSES.includes(l.status))
      .length,
    completedOrders: loans.filter((l) => l.status === "settled").length,
    totalOwedCentavos: totalOwed,
    totalPaidCentavos: totalPaid,
    installmentsPaid: paidCount,
    installmentsTotal: totalCount,
    onTimePct: paidCount === 0 ? null : Math.round((onTime / paidCount) * 100),
    nextPayment: upcoming[0] ?? null,
    upcoming,
    overdueCount: upcoming.filter((u) => u.overdue).length,
    totalPenaltyCentavos: totalPenalty,
  };
}

export type SellerStats = {
  totalOrders: number;
  /** In-flight orders (not settled, not refunded). */
  activeOrders: number;
  completedOrders: number;
  /** Gross ticket value of non-refunded orders. */
  grossSalesCentavos: number;
  /** Net (after fee) the seller keeps across non-refunded orders. */
  netEarnedCentavos: number;
  /** Net still in the pipeline — money not yet paid out. */
  pendingPayoutCentavos: number;
  /** Net already paid out (settled orders). */
  paidOutCentavos: number;
  /** Total Datung fees on non-refunded orders. */
  feesCentavos: number;
  /** Gross ticket value of orders created this month. */
  thisMonthSalesCentavos: number;
};

/** `monthPrefix` is a YYYY-MM string used to bucket "this month" sales. */
export function sellerStats(
  loans: SellerLoanView[],
  monthPrefix: string,
): SellerStats {
  let gross = 0;
  let net = 0;
  let fees = 0;
  let pending = 0;
  let paidOut = 0;
  let thisMonth = 0;
  let active = 0;
  let completed = 0;

  for (const l of loans) {
    const refunded = l.status === "refunded";

    if (!refunded) {
      gross += l.ticket_centavos;
      net += l.netCentavos;
      fees += l.feeCentavos;
      if (l.created_at.slice(0, 7) === monthPrefix) {
        thisMonth += l.ticket_centavos;
      }
    }

    if (l.status === "settled") {
      paidOut += l.netCentavos;
      completed += 1;
    } else if (!refunded) {
      pending += l.netCentavos;
      active += 1;
    }
  }

  return {
    totalOrders: loans.length,
    activeOrders: active,
    completedOrders: completed,
    grossSalesCentavos: gross,
    netEarnedCentavos: net,
    pendingPayoutCentavos: pending,
    paidOutCentavos: paidOut,
    feesCentavos: fees,
    thisMonthSalesCentavos: thisMonth,
  };
}
