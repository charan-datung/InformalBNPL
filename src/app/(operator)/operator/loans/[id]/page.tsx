import Link from "next/link";
import { notFound } from "next/navigation";
import { getLoanWithEvents } from "@/lib/operator/queries";
import { getConfig } from "@/lib/config/system-config";
import { disputeWindow } from "@/lib/loans/window";
import {
  transitionLoanAction,
  recordRepaymentAction,
  recordReceiptCheckAction,
} from "@/app/(operator)/operator/actions";
import {
  LOAN_STATUSES,
  canTransition,
  isTerminal,
} from "@/lib/loans/state-machine";
import { STATUS_STYLES, StatusBadge } from "@/lib/loans/status-ui";
import { installmentPenaltyCentavos } from "@/lib/loans/finance";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LoanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const { loan, events, repayments, shipmentProofUrl } =
    await getLoanWithEvents(id);
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

  // Dispute window (only meaningful while shipped). Computed on load — no cron.
  const config = await getConfig();
  const shippedEvent = events.find((e) => e.event_type === "shipped");
  const win =
    loan.status === "shipped"
      ? disputeWindow(shippedEvent?.created_at ?? null, config.dispute_window_days)
      : { applicable: false as const };

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
        {loan.hasOverride ? (
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            OVERRIDE
          </span>
        ) : null}
        <Link
          href={`/loan/${loan.id}/documents`}
          target="_blank"
          className="ml-auto text-sm font-medium text-brand-700 underline underline-offset-4"
        >
          View loan documents
        </Link>
      </div>

      {loan.hasOverride ? (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          ⚠ This loan has been force-changed by an admin override. See the
          flagged rows in the audit trail below.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {ok ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
          {ok}
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

      {shipmentProofUrl ? (
        <p className="text-sm">
          <a
            href={shipmentProofUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            View shipment proof →
          </a>
        </p>
      ) : null}

      {/* Dispute window status (while shipped) */}
      {win.applicable ? (
        win.elapsed ? (
          <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
            Dispute window passed ({formatDateTime(win.endsAt.toISOString())}) —
            no dispute. Ready to clear (→ auto-released) and release.
          </p>
        ) : (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            In dispute window — buyer may dispute until{" "}
            {formatDateTime(win.endsAt.toISOString())} ({win.daysLeft} day(s)
            left). Hold release until then.
          </p>
        )
      ) : null}

      {/* Buyer contact + manual receipt check (anti-fraud before release) */}
      {["escrow_held", "shipped", "delivered_confirmed", "auto_released"].includes(
        loan.status,
      ) ? (
        <section className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
            Buyer receipt check
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <Fact k="Buyer" v={loan.buyerName} />
            <Fact k="Buyer contact" v={loan.buyerContact ?? "—"} />
            <Fact k="Seller" v={loan.sellerName} />
            <Fact k="Seller contact" v={loan.sellerContact ?? "—"} />
          </div>
          {loan.status === "escrow_held" && loan.handover_code ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              In-person sale awaiting hand-over. The buyer holds a 6-digit code;
              the seller confirms by entering it. Not yet handed over.
            </p>
          ) : null}
          <p className="text-xs text-black/50 dark:text-white/50">
            Call or message the buyer to confirm they actually received the item,
            then record the result.{" "}
            {loan.status === "shipped"
              ? "Confirming receipt here marks the order delivered (release-ready) — the same as the buyer tapping “I received it.”"
              : "This is logged to the audit trail."}
          </p>
          <form
            action={recordReceiptCheckAction}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="loanId" value={loan.id} />
            <select
              name="received"
              defaultValue="yes"
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            >
              <option value="yes">
                {loan.status === "shipped"
                  ? "Buyer received it → mark delivered"
                  : "Buyer received it"}
              </option>
              <option value="no">Buyer did NOT receive it</option>
            </select>
            <input
              type="text"
              name="notes"
              placeholder="Notes (e.g. called 0917…, confirmed)"
              className="min-w-0 flex-1 rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
            >
              Record check
            </button>
          </form>
        </section>
      ) : null}

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
                const penalty = overdue
                  ? installmentPenaltyCentavos({
                      amountCentavos: r.amount_centavos,
                      dueDate: r.due_date,
                      todayIso: today,
                      penaltyRateMonthly: config.penalty_rate_monthly,
                    })
                  : 0;
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
                        <span className="text-red-600">
                          overdue
                          {penalty > 0 ? ` · +${formatPeso(penalty)} penalty` : ""}
                        </span>
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
              {events.map((e) => {
                const override = e.event_type === "admin_override";
                return (
                <tr
                  key={e.id}
                  className={`border-b border-black/5 align-top dark:border-white/5 ${
                    override ? "bg-red-50 dark:bg-red-950/40" : ""
                  }`}
                >
                  <td className="whitespace-nowrap py-2 pr-3 text-black/60 dark:text-white/60">
                    {formatDateTime(e.created_at)}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {override ? (
                      <span className="rounded bg-red-600 px-1 py-0.5 font-bold text-white">
                        {e.event_type}
                      </span>
                    ) : (
                      e.event_type
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatPeso(e.amount_centavos)}
                  </td>
                  <td className="py-2 pr-3">{e.actorName ?? "system"}</td>
                  <td className="py-2 text-black/70 dark:text-white/70">
                    {e.note ?? ""}
                  </td>
                </tr>
                );
              })}
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
