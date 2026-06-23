import { computeMetrics } from "@/lib/metrics/compute";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function pct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}
function dys(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}d`;
}

function ExportLink({ metric }: { metric: string }) {
  return (
    <a
      href={`/operator/metrics/export?metric=${metric}`}
      className="text-xs underline underline-offset-4"
    >
      Download CSV
    </a>
  );
}

function SectionHead({
  title,
  metric,
  note,
}: {
  title: string;
  metric: string;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ExportLink metric={metric} />
      {note ? (
        <p className="w-full text-xs text-black/45 dark:text-white/45">{note}</p>
      ) : null}
    </div>
  );
}

export default async function MetricsPage() {
  const m = await computeMetrics();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Metrics</h1>
        <span className="text-xs text-black/50 dark:text-white/50">
          {m.totalLoans} loans · generated {formatDateTime(m.generatedAt)}
        </span>
      </div>

      {/* Underwriting (application pipeline — front of the funnel) */}
      <section className="space-y-3">
        <SectionHead
          title="Underwriting"
          metric="underwriting"
          note="Buyer applications, underwritten manually today. These are the signals a future automated scorecard (credit-bureau pulls + internal logic) will threshold on. Exposure = requested amount ÷ monthly cash flow."
        />
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="Applications" value={String(m.underwriting.totalApplications)} />
          <Kpi label="Approval rate" value={pct(m.underwriting.approvalRate)} />
          <Kpi
            label="Avg requested"
            value={formatPeso(m.underwriting.avgRequestedCentavos ?? null)}
          />
          <Kpi
            label="Approved ÷ requested"
            value={pct(m.underwriting.approvedToRequestedRatio)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi label="Pending review" value={String(m.underwriting.pending)} />
          <Kpi
            label="Business / personal"
            value={`${m.underwriting.business} / ${m.underwriting.personal}`}
          />
          <Kpi
            label="With existing loans"
            value={String(m.underwriting.withExistingLoans)}
          />
        </div>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <BandTable
            title="Monthly cash flow"
            unit="applicants"
            bands={m.underwriting.cashflowBands}
          />
          <BandTable
            title="Exposure (requested ÷ cash flow)"
            unit="applicants"
            bands={m.underwriting.exposureBands}
          />
          <BandTable
            title="Sourcing channels"
            unit="mentions"
            bands={m.underwriting.sourcing}
            empty="No business applicants yet."
          />
          <BandTable
            title="Selling channels"
            unit="mentions"
            bands={m.underwriting.channels}
            empty="No business applicants yet."
          />
        </div>
      </section>

      {/* Loan funnel */}
      <section className="space-y-2">
        <SectionHead title="Loan funnel" metric="funnel" />
        <table className="w-full max-w-xl text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 pr-3 text-right font-medium">Count</th>
              <th className="py-1.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {m.funnel.map((f) => (
              <tr key={f.status} className="border-b border-black/5 dark:border-white/5">
                <td className="py-1.5 pr-3">
                  <StatusBadge status={f.status} />
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{f.count}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatPeso(f.amountCentavos)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Realized loss */}
      <section className="space-y-2">
        <SectionHead
          title="Realized loss"
          metric="outcomes"
          note="Defaulted = loans in repayment with an overdue, unpaid installment; amount = outstanding balance. Loss rate = defaulted ÷ disbursed."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Kpi label="Loss rate (by count)" value={pct(m.outcomes.lossRateByCount)} />
          <Kpi label="Loss rate (by amount)" value={pct(m.outcomes.lossRateByAmount)} />
        </div>
        <table className="w-full max-w-xl text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <th className="py-1.5 pr-3 font-medium">Outcome</th>
              <th className="py-1.5 pr-3 text-right font-medium">Count</th>
              <th className="py-1.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <OutcomeRow label="Disbursed" c={m.outcomes.disbursedCount} a={m.outcomes.disbursedAmountCentavos} />
            <OutcomeRow label="Settled" c={m.outcomes.settledCount} a={m.outcomes.settledAmountCentavos} />
            <OutcomeRow label="Defaulted (overdue)" c={m.outcomes.defaultedCount} a={m.outcomes.defaultedAmountCentavos} />
            <OutcomeRow label="Refunded" c={m.outcomes.refundedCount} a={m.outcomes.refundedAmountCentavos} />
          </tbody>
        </table>
      </section>

      {/* Disputes */}
      <section className="space-y-2">
        <SectionHead title="Disputes" metric="disputes" />
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="Dispute rate" value={pct(m.disputes.disputeRate)} />
          <Kpi label="Total" value={String(m.disputes.totalDisputes)} />
          <Kpi label="Buyer favor" value={String(m.disputes.buyerFavor)} />
          <Kpi label="Seller favor" value={String(m.disputes.sellerFavor)} />
        </div>
        <p className="text-xs text-black/45 dark:text-white/45">
          {m.disputes.open} still open · {m.disputes.totalDisputes} of{" "}
          {m.disputes.totalLoans} loans disputed.
        </p>
      </section>

      {/* Per-seller */}
      <section className="space-y-2">
        <SectionHead title="Per-seller stats" metric="sellers" />
        {m.sellers.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">No sellers with loans yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                  <th className="py-1.5 pr-3 font-medium">Seller</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Loans</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Dispute rate</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Default rate</th>
                  <th className="py-1.5 text-right font-medium">Avg days to payout</th>
                </tr>
              </thead>
              <tbody>
                {m.sellers.map((s) => (
                  <tr key={s.sellerId} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-1.5 pr-3">{s.sellerName}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{s.loanCount}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {pct(s.disputeRate)} ({s.disputeCount})
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {pct(s.defaultRate)} ({s.defaultCount})
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{dys(s.avgDaysToPayout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Stage durations */}
      <section className="space-y-2">
        <SectionHead
          title="Avg time per stage"
          metric="durations"
          note="Time between lifecycle events, averaged over loans that reached both. shipped → escrow_released is how long sellers actually wait."
        />
        <table className="w-full max-w-xl text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <th className="py-1.5 pr-3 font-medium">Transition</th>
              <th className="py-1.5 pr-3 text-right font-medium">Samples</th>
              <th className="py-1.5 text-right font-medium">Avg</th>
            </tr>
          </thead>
          <tbody>
            {m.durations.map((d) => (
              <tr
                key={d.transition}
                className={`border-b border-black/5 dark:border-white/5 ${
                  d.transition.startsWith("shipped") ? "font-medium" : ""
                }`}
              >
                <td className="py-1.5 pr-3 font-mono text-xs">{d.transition}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{d.samples}</td>
                <td className="py-1.5 text-right tabular-nums">{dys(d.avgDays)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-black/55 dark:text-white/55">{label}</div>
    </div>
  );
}

function BandTable({
  title,
  unit,
  bands,
  empty,
}: {
  title: string;
  unit: string;
  bands: { label: string; count: number }[];
  empty?: string;
}) {
  const total = bands.reduce((s, b) => s + b.count, 0);
  const shown = bands.filter((b) => b.count > 0 || b.label !== "Unknown");
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold">{title}</h3>
        <span className="text-[11px] text-black/40 dark:text-white/40">
          {total} {unit}
        </span>
      </div>
      {total === 0 && empty ? (
        <p className="text-xs text-black/45 dark:text-white/45">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {shown.map((b) => {
              const frac = total > 0 ? b.count / total : 0;
              return (
                <tr key={b.label}>
                  <td className="w-40 py-0.5 pr-3 text-xs text-black/60 dark:text-white/60">
                    {b.label}
                  </td>
                  <td className="py-0.5">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.round(frac * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="w-8 py-0.5 pl-2 text-right text-xs tabular-nums">
                    {b.count}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function OutcomeRow({ label, c, a }: { label: string; c: number; a: number }) {
  return (
    <tr className="border-b border-black/5 dark:border-white/5">
      <td className="py-1.5 pr-3">{label}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{c}</td>
      <td className="py-1.5 text-right tabular-nums">{formatPeso(a)}</td>
    </tr>
  );
}
