import { createAdminClient } from "@/lib/supabase/admin";
import { LOAN_STATUSES, type LoanStatus } from "@/lib/loans/state-machine";

/**
 * Pilot metrics — computed from real activity to replace placeholder
 * assumptions in the financial model. Accuracy over polish, so every metric's
 * DEFINITION is spelled out here (and surfaced in the UI):
 *
 *  - Disbursed  = escrow was released to the seller (status escrow_released,
 *                 repaying, or settled).
 *  - Settled    = fully repaid (status = settled).
 *  - Defaulted  = status = repaying AND has at least one installment past its
 *                 due date and unpaid. (Operational default; there is no formal
 *                 default state in the pilot.) Its "amount" is the outstanding
 *                 unpaid balance on those loans.
 *  - Refunded   = reversed to the buyer (status = refunded); no seller payout.
 *  - Loss rate  = defaulted ÷ disbursed (separately by count and by amount).
 *  - Days-to-payout = days from the `shipped` event to the `escrow_released`
 *                 event (how long sellers actually wait).
 *
 * Computation reads all rows and reduces in JS — fine at pilot scale.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DISBURSED: LoanStatus[] = ["escrow_released", "repaying", "settled"];

export type FunnelRow = {
  status: LoanStatus;
  count: number;
  amountCentavos: number;
};

export type OutcomeMetrics = {
  disbursedCount: number;
  disbursedAmountCentavos: number;
  settledCount: number;
  settledAmountCentavos: number;
  defaultedCount: number;
  defaultedAmountCentavos: number;
  refundedCount: number;
  refundedAmountCentavos: number;
  lossRateByCount: number | null;
  lossRateByAmount: number | null;
};

export type DisputeMetrics = {
  totalLoans: number;
  totalDisputes: number;
  disputeRate: number | null;
  buyerFavor: number;
  sellerFavor: number;
  open: number;
};

export type SellerStat = {
  sellerId: string;
  sellerName: string;
  loanCount: number;
  disputeCount: number;
  disputeRate: number | null;
  defaultCount: number;
  defaultRate: number | null;
  avgDaysToPayout: number | null;
};

export type DurationStat = {
  transition: string;
  samples: number;
  avgDays: number | null;
};

export type Metrics = {
  generatedAt: string;
  totalLoans: number;
  funnel: FunnelRow[];
  outcomes: OutcomeMetrics;
  disputes: DisputeMetrics;
  sellers: SellerStat[];
  durations: DurationStat[];
};

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function computeMetrics(): Promise<Metrics> {
  const admin = createAdminClient();
  const [
    { data: loans },
    { data: disputes },
    { data: repayments },
    { data: events },
    { data: users },
  ] = await Promise.all([
    admin
      .from("loans")
      .select("id, status, ticket_centavos, seller_user_id"),
    admin.from("disputes").select("loan_id, status, resolution"),
    admin
      .from("repayments")
      .select("loan_id, amount_centavos, due_date, status"),
    admin
      .from("escrow_events")
      .select("loan_id, event_type, created_at")
      .order("created_at", { ascending: true }),
    admin.from("users").select("id, name"),
  ]);

  const loanRows = loans ?? [];
  const names = new Map((users ?? []).map((u) => [u.id, u.name]));
  const today = new Date().toISOString().slice(0, 10);

  // Outstanding (unpaid, non-waived) per loan, and whether overdue.
  const outstanding = new Map<string, number>();
  const overdue = new Map<string, boolean>();
  for (const r of repayments ?? []) {
    if (r.status !== "paid" && r.status !== "waived") {
      outstanding.set(
        r.loan_id,
        (outstanding.get(r.loan_id) ?? 0) + r.amount_centavos,
      );
      if (r.due_date < today) overdue.set(r.loan_id, true);
    }
  }

  const isDefaulted = (loanId: string, status: LoanStatus) =>
    status === "repaying" && overdue.get(loanId) === true;

  // ---- Funnel ----
  const funnel: FunnelRow[] = LOAN_STATUSES.map((status) => {
    const rows = loanRows.filter((l) => l.status === status);
    return {
      status,
      count: rows.length,
      amountCentavos: rows.reduce((s, l) => s + l.ticket_centavos, 0),
    };
  });

  // ---- Outcomes / realized loss ----
  const disbursedLoans = loanRows.filter((l) =>
    DISBURSED.includes(l.status as LoanStatus),
  );
  const settled = loanRows.filter((l) => l.status === "settled");
  const refunded = loanRows.filter((l) => l.status === "refunded");
  const defaulted = loanRows.filter((l) =>
    isDefaulted(l.id, l.status as LoanStatus),
  );

  const disbursedAmount = disbursedLoans.reduce(
    (s, l) => s + l.ticket_centavos,
    0,
  );
  const defaultedAmount = defaulted.reduce(
    (s, l) => s + (outstanding.get(l.id) ?? 0),
    0,
  );

  const outcomes: OutcomeMetrics = {
    disbursedCount: disbursedLoans.length,
    disbursedAmountCentavos: disbursedAmount,
    settledCount: settled.length,
    settledAmountCentavos: settled.reduce((s, l) => s + l.ticket_centavos, 0),
    defaultedCount: defaulted.length,
    defaultedAmountCentavos: defaultedAmount,
    refundedCount: refunded.length,
    refundedAmountCentavos: refunded.reduce((s, l) => s + l.ticket_centavos, 0),
    lossRateByCount:
      disbursedLoans.length > 0 ? defaulted.length / disbursedLoans.length : null,
    lossRateByAmount: disbursedAmount > 0 ? defaultedAmount / disbursedAmount : null,
  };

  // ---- Disputes ----
  const disputeRows = disputes ?? [];
  const buyerFavor = disputeRows.filter((d) =>
    (d.resolution ?? "").startsWith("buyer_favour"),
  ).length;
  const sellerFavor = disputeRows.filter((d) =>
    (d.resolution ?? "").startsWith("seller_favour"),
  ).length;
  const openD = disputeRows.filter(
    (d) => d.status === "open" || d.status === "under_review",
  ).length;

  const disputeMetrics: DisputeMetrics = {
    totalLoans: loanRows.length,
    totalDisputes: disputeRows.length,
    disputeRate: loanRows.length > 0 ? disputeRows.length / loanRows.length : null,
    buyerFavor,
    sellerFavor,
    open: openD,
  };

  // ---- Per-loan first-event timestamps (for durations / days-to-payout) ----
  const firstEvent = new Map<string, Map<string, string>>();
  for (const e of events ?? []) {
    let m = firstEvent.get(e.loan_id);
    if (!m) {
      m = new Map();
      firstEvent.set(e.loan_id, m);
    }
    if (!m.has(e.event_type)) m.set(e.event_type, e.created_at);
  }
  const daysBetween = (loanId: string, from: string, to: string): number | null => {
    const m = firstEvent.get(loanId);
    const a = m?.get(from);
    const b = m?.get(to);
    if (!a || !b) return null;
    return (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS;
  };

  // ---- Per-seller stats ----
  const bySeller = new Map<string, typeof loanRows>();
  for (const l of loanRows) {
    const list = bySeller.get(l.seller_user_id) ?? [];
    list.push(l);
    bySeller.set(l.seller_user_id, list);
  }
  const disputesByLoan = new Set(disputeRows.map((d) => d.loan_id));

  const sellers: SellerStat[] = [...bySeller.entries()]
    .map(([sellerId, sLoans]) => {
      const disputeCount = sLoans.filter((l) => disputesByLoan.has(l.id)).length;
      const defaultCount = sLoans.filter((l) =>
        isDefaulted(l.id, l.status as LoanStatus),
      ).length;
      const payoutDays = sLoans
        .map((l) => daysBetween(l.id, "shipped", "escrow_released"))
        .filter((d): d is number => d !== null);
      return {
        sellerId,
        sellerName: names.get(sellerId) ?? sellerId,
        loanCount: sLoans.length,
        disputeCount,
        disputeRate: sLoans.length > 0 ? disputeCount / sLoans.length : null,
        defaultCount,
        defaultRate: sLoans.length > 0 ? defaultCount / sLoans.length : null,
        avgDaysToPayout: avg(payoutDays),
      };
    })
    .sort((a, b) => b.loanCount - a.loanCount);

  // ---- Avg elapsed time per stage ----
  const TRANSITIONS: [string, string][] = [
    ["booked", "escrow_held"],
    ["escrow_held", "shipped"],
    ["shipped", "escrow_released"],
    ["escrow_released", "settled"],
  ];
  const durations: DurationStat[] = TRANSITIONS.map(([from, to]) => {
    const ds = loanRows
      .map((l) => daysBetween(l.id, from, to))
      .filter((d): d is number => d !== null);
    return { transition: `${from} → ${to}`, samples: ds.length, avgDays: avg(ds) };
  });

  return {
    generatedAt: new Date().toISOString(),
    totalLoans: loanRows.length,
    funnel,
    outcomes,
    disputes: disputeMetrics,
    sellers,
    durations,
  };
}
