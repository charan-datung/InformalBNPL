import Link from "next/link";
import { notFound } from "next/navigation";
import { getLoanWithEvents } from "@/lib/operator/queries";
import {
  transitionLoanAction,
  recordRepaymentAction,
} from "@/app/(operator)/operator/actions";
import {
  LOAN_STATUSES,
  canTransition,
  isTerminal,
} from "@/lib/loans/state-machine";
import { STATUS_STYLES, StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LoanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { loan, events, repayments } = await getLoanWithEvents(id);
  if (!loan) notFound();

  const repaidCentavos = repayments
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + r.amount_centavos, 0);
  const scheduledCentavos = repayments.reduce(
    (sum, r) => sum + r.amount_centavos,
    0,
  );
  const today = new Date().toISOString().slice(0, 10);

  // Net-to-seller preview for an escrow release (merchant fee is the per-loan
  // value, originally sourced from system_config at booking).
  const feeCentavos = Math.round(
    (loan.ticket_centavos * loan.merchant_fee_pct) / 100,
  );
  const netCentavos = loan.ticket_centavos - feeCentavos;

  const candidates = LOAN_STATUSES.filter((s) => s !== loan.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/operator/loans"
          className="text-sm underline underline-offset-4"
        >
          ← Loans
        </Link>
        <StatusBadge status={loan.status} />
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* Loan facts */}
      <section className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <Fact k="Buyer" v={loan.buyerName} />
        <Fact k="Seller" v={loan.sellerName} />
        <Fact k="Ticket" v={formatPeso(loan.ticket_centavos)} />
        <Fact k="Tenor" v={`${loan.tenor_months} months`} />
        <Fact
          k="Interest (monthly)"
          v={`${(loan.interest_rate_monthly * 100).toFixed(2)}%`}
        />
        <Fact k="Merchant fee" v={`${loan.merchant_fee_pct}%`} />
        <Fact k="Created" v={formatDateTime(loan.created_at)} />
        <Fact k="Updated" v={formatDateTime(loan.updated_at)} />
      </section>

      {/* Transitions: only valid next states are enabled. */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Advance state
        </h2>
        {isTerminal(loan.status) ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            This loan is in a terminal state — no further transitions.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {candidates.map((target) => {
              const allowed = canTransition(loan.status, target);
              const isRelease = target === "escrow_released";
              const label = isRelease
                ? `Release escrow → net ${formatPeso(netCentavos)}`
                : STATUS_STYLES[target].label;
              return (
                <form key={target} action={transitionLoanAction}>
                  <input type="hidden" name="loanId" value={loan.id} />
                  <input type="hidden" name="to" value={target} />
                  <button
                    type="submit"
                    disabled={!allowed}
                    title={
                      allowed
                        ? `Move to ${target}`
                        : `Not a valid transition from ${loan.status}`
                    }
                    className={
                      allowed
                        ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                        : "cursor-not-allowed rounded-md border border-black/10 px-3 py-1.5 text-sm text-black/30 dark:border-white/10 dark:text-white/30"
                    }
                  >
                    {label}
                  </button>
                </form>
              );
            })}
          </div>
        )}
        {canTransition(loan.status, "escrow_released") ? (
          <p className="text-xs text-black/50 dark:text-white/50">
            Releasing escrow records a {loan.merchant_fee_pct}% merchant fee of{" "}
            {formatPeso(feeCentavos)}; net to seller {formatPeso(netCentavos)}.
          </p>
        ) : null}
      </section>

      {/* Repayment schedule (generated when the loan enters `repaying`) */}
      {repayments.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
            Repayment schedule — {formatPeso(repaidCentavos)} of{" "}
            {formatPeso(scheduledCentavos)} recorded
          </h2>
          <table className="w-full max-w-xl text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Due</th>
                <th className="py-2 pr-3 text-right font-medium">Amount</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {repayments.map((r, i) => {
                const overdue = r.status !== "paid" && r.due_date < today;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-black/5 dark:border-white/5"
                  >
                    <td className="py-2 pr-3 text-black/50 dark:text-white/50">
                      {i + 1}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{r.due_date}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatPeso(r.amount_centavos)}
                    </td>
                    <td className="py-2 pr-3">
                      {r.status === "paid" ? (
                        <span className="text-green-600">paid</span>
                      ) : overdue ? (
                        <span className="text-red-600">overdue</span>
                      ) : (
                        <span className="text-black/50 dark:text-white/50">
                          pending
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      {r.status !== "paid" ? (
                        <form action={recordRepaymentAction}>
                          <input type="hidden" name="loanId" value={loan.id} />
                          <input
                            type="hidden"
                            name="repaymentId"
                            value={r.id}
                          />
                          <button
                            type="submit"
                            className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                          >
                            Record paid
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* Append-only audit trail */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Audit trail ({events.length}) — append-only
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Event</th>
                <th className="py-2 pr-3 text-right font-medium">Amount</th>
                <th className="py-2 pr-3 font-medium">Actor</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-black/5 align-top dark:border-white/5"
                >
                  <td className="whitespace-nowrap py-2 pr-3 text-black/60 dark:text-white/60">
                    {formatDateTime(e.created_at)}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{e.event_type}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatPeso(e.amount_centavos)}
                  </td>
                  <td className="py-2 pr-3">{e.actorName ?? "system"}</td>
                  <td className="py-2 text-black/70 dark:text-white/70">
                    {e.note ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-black/50 dark:text-white/50">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
