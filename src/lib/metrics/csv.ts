import type { Metrics } from "@/lib/metrics/compute";

/**
 * CSV serialization for each metric section. Money is exported as raw integer
 * CENTAVOS (the canonical precise value) for the financial model; rates as
 * decimals (0..1). One export per metric, plus "all".
 */

export type MetricName =
  | "funnel"
  | "outcomes"
  | "disputes"
  | "sellers"
  | "durations"
  | "underwriting";

function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function table(headers: string[], rows: (string | number | null)[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

function rate(n: number | null): string {
  return n === null ? "" : n.toFixed(4);
}

function days(n: number | null): string {
  return n === null ? "" : n.toFixed(2);
}

export function metricToCsv(m: Metrics, which: MetricName): string {
  switch (which) {
    case "funnel":
      return table(
        ["status", "count", "amount_centavos"],
        m.funnel.map((f) => [f.status, f.count, f.amountCentavos]),
      );

    case "outcomes":
      return table(
        ["metric", "count", "amount_centavos", "rate"],
        [
          ["disbursed", m.outcomes.disbursedCount, m.outcomes.disbursedAmountCentavos, ""],
          ["settled", m.outcomes.settledCount, m.outcomes.settledAmountCentavos, ""],
          ["defaulted", m.outcomes.defaultedCount, m.outcomes.defaultedAmountCentavos, ""],
          ["refunded", m.outcomes.refundedCount, m.outcomes.refundedAmountCentavos, ""],
          ["loss_rate_by_count", "", "", rate(m.outcomes.lossRateByCount)],
          ["loss_rate_by_amount", "", "", rate(m.outcomes.lossRateByAmount)],
        ],
      );

    case "disputes":
      return table(
        ["metric", "value"],
        [
          ["total_loans", m.disputes.totalLoans],
          ["total_disputes", m.disputes.totalDisputes],
          ["dispute_rate", rate(m.disputes.disputeRate)],
          ["resolved_buyer_favor", m.disputes.buyerFavor],
          ["resolved_seller_favor", m.disputes.sellerFavor],
          ["open", m.disputes.open],
        ],
      );

    case "sellers":
      return table(
        [
          "seller_id",
          "seller_name",
          "loan_count",
          "dispute_count",
          "dispute_rate",
          "default_count",
          "default_rate",
          "avg_days_to_payout",
        ],
        m.sellers.map((s) => [
          s.sellerId,
          s.sellerName,
          s.loanCount,
          s.disputeCount,
          rate(s.disputeRate),
          s.defaultCount,
          rate(s.defaultRate),
          days(s.avgDaysToPayout),
        ]),
      );

    case "durations":
      return table(
        ["transition", "samples", "avg_days"],
        m.durations.map((d) => [d.transition, d.samples, days(d.avgDays)]),
      );

    case "underwriting": {
      const u = m.underwriting;
      return table(
        ["section", "label", "value"],
        [
          ["summary", "total_applications", u.totalApplications],
          ["summary", "pending", u.pending],
          ["summary", "verified", u.verified],
          ["summary", "rejected", u.rejected],
          ["summary", "approval_rate", rate(u.approvalRate)],
          ["summary", "business", u.business],
          ["summary", "personal", u.personal],
          ["summary", "with_existing_loans", u.withExistingLoans],
          ["credit", "requested_total_centavos", u.requestedTotalCentavos],
          ["credit", "approved_total_centavos", u.approvedTotalCentavos],
          ["credit", "avg_requested_centavos", u.avgRequestedCentavos ?? ""],
          ["credit", "avg_approved_centavos", u.avgApprovedCentavos ?? ""],
          ["credit", "approved_to_requested_ratio", rate(u.approvedToRequestedRatio)],
          ...u.cashflowBands.map((b) => ["cashflow_band", b.label, b.count]),
          ...u.exposureBands.map((b) => ["exposure_band", b.label, b.count]),
          ...u.sourcing.map((b) => ["sourcing", b.label, b.count]),
          ...u.channels.map((b) => ["channel", b.label, b.count]),
        ],
      );
    }
  }
}
