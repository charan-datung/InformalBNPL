import { listBuyerLoans, listVerifiedSellers } from "@/lib/loans/views";
import { getBuyerCredit } from "@/lib/loans/credit";
import { getConfig } from "@/lib/config/system-config";
import {
  confirmReceiptAction,
  reportProblemAction,
} from "@/app/(public)/dashboard/actions";
import Checkout from "@/app/(public)/dashboard/Checkout";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDateTime } from "@/lib/format";

/**
 * Buyer dashboard: checkout (with a live repayment-schedule preview), an
 * impossible-to-miss summary of what's due, active loans with their schedule,
 * and — on shipped items — a positive "Confirm receipt" plus a "Report a
 * problem within the window" path.
 */

function addDays(iso: string, days: number): Date {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d;
}

export default async function BuyerPanel({ userId }: { userId: string }) {
  const [loans, sellers, credit, config] = await Promise.all([
    listBuyerLoans(userId),
    listVerifiedSellers(),
    getBuyerCredit(userId),
    getConfig(),
  ]);

  // Everything the buyer currently owes, across all loans.
  const unpaid = loans.flatMap((l) =>
    l.repayments.filter((r) => r.status !== "paid" && r.status !== "waived"),
  );
  const totalDue = unpaid.reduce((s, r) => s + r.amount_centavos, 0);
  const nextOverall = [...unpaid].sort((a, b) =>
    a.due_date < b.due_date ? -1 : 1,
  )[0];

  const usedPct =
    credit.limitCentavos > 0
      ? Math.round((credit.outstandingCentavos / credit.limitCentavos) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Revolving credit line — the heart of repeat instant checkout */}
      <div className="rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-4 dark:border-white/10 dark:from-brand-950 dark:to-brand-900">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-black/45 dark:text-white/45">
            Available credit
          </span>
          <span className="text-xs text-black/45 dark:text-white/45">
            of {formatPeso(credit.limitCentavos)}
          </span>
        </div>
        <div className="text-3xl font-bold tabular-nums text-brand-800 dark:text-white">
          {formatPeso(credit.availableCentavos)}
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${usedPct}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-black/45 dark:text-white/45">
          Scan a seller&apos;s Datung Pay QR to buy instantly. {formatPeso(credit.outstandingCentavos)} in use.
        </p>
      </div>

      <Checkout
        sellers={sellers}
        monthlyRate={config.default_interest_rate_monthly}
        defaultTenor={config.default_tenor_months}
        creditLimitCentavos={credit.availableCentavos}
      />

      {/* Amounts due — impossible to miss */}
      {totalDue > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <div className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-300">
            You owe
          </div>
          <div className="text-3xl font-bold tabular-nums text-amber-900 dark:text-amber-200">
            {formatPeso(totalDue)}
          </div>
          {nextOverall ? (
            <div className="text-sm text-amber-800 dark:text-amber-300">
              Next payment {formatPeso(nextOverall.amount_centavos)} due{" "}
              {nextOverall.due_date}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Active loans */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Your purchases ({loans.length})
        </h2>
        {loans.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            No purchases yet.
          </p>
        ) : (
          loans.map((l) => {
            const reportDeadline = l.shippedAt
              ? addDays(l.shippedAt, config.dispute_window_days)
              : null;
            const reportOpen = reportDeadline
              ? new Date() < reportDeadline
              : false;

            return (
              <div
                key={l.id}
                className="space-y-3 rounded-lg border border-black/10 p-4 text-sm dark:border-white/10"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={l.status} />
                  <span className="font-medium">
                    {formatPeso(l.ticket_centavos)}
                  </span>
                  <span className="text-black/60 dark:text-white/60">
                    · {l.tenor_months}mo · from {l.sellerName}
                  </span>
                  <span className="ml-auto text-xs text-black/40 dark:text-white/40">
                    {formatDateTime(l.created_at)}
                  </span>
                </div>

                {/* Shipped: confirm receipt (positive) or report a problem */}
                {l.status === "shipped" ? (
                  <div className="space-y-3 border-t border-black/5 pt-3 dark:border-white/5">
                    <p className="text-black/70 dark:text-white/70">
                      Your item is on the way. Once it arrives and everything
                      looks good, confirm receipt.
                    </p>
                    <form action={confirmReceiptAction}>
                      <input type="hidden" name="loanId" value={l.id} />
                      <button
                        type="submit"
                        className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
                      >
                        Confirm receipt — all good
                      </button>
                    </form>

                    <details>
                      <summary className="cursor-pointer text-xs text-black/50 dark:text-white/50">
                        Something wrong? Report a problem
                        {reportDeadline
                          ? ` (within ${config.dispute_window_days} days, until ${reportDeadline
                              .toISOString()
                              .slice(0, 10)})`
                          : ""}
                      </summary>
                      {reportOpen ? (
                        <form
                          action={reportProblemAction}
                          encType="multipart/form-data"
                          className="mt-2 space-y-2"
                        >
                          <input type="hidden" name="loanId" value={l.id} />
                          <textarea
                            name="reason"
                            required
                            rows={2}
                            placeholder="Describe the problem"
                            className="w-full rounded-md border border-black/15 px-3 py-1.5 text-xs dark:border-white/15 dark:bg-transparent"
                          />
                          <label className="block space-y-1">
                            <span className="text-xs font-medium">
                              Photo (required)
                            </span>
                            <input
                              type="file"
                              name="evidence"
                              accept="image/*"
                              capture="environment"
                              required
                              className="block text-xs"
                            />
                          </label>
                          <button
                            type="submit"
                            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            Submit report
                          </button>
                        </form>
                      ) : (
                        <p className="mt-2 text-xs text-black/50 dark:text-white/50">
                          The reporting window has closed for this order.
                        </p>
                      )}
                    </details>
                  </div>
                ) : null}

                {/* Repayment schedule + amounts due */}
                {l.repayments.length > 0 ? (
                  <div className="border-t border-black/5 pt-3 dark:border-white/5">
                    <div className="mb-1 text-xs font-medium text-black/50 dark:text-white/50">
                      Repayment schedule
                    </div>
                    <table className="w-full">
                      <tbody>
                        {l.repayments.map((r, i) => {
                          const overdue =
                            r.status !== "paid" &&
                            r.due_date < new Date().toISOString().slice(0, 10);
                          return (
                            <tr
                              key={r.id}
                              className="border-b border-black/5 last:border-0 dark:border-white/5"
                            >
                              <td className="py-1 pr-3 text-black/40 dark:text-white/40">
                                {i + 1}
                              </td>
                              <td className="py-1 pr-3 tabular-nums">
                                {r.due_date}
                              </td>
                              <td className="py-1 pr-3 text-right font-medium tabular-nums">
                                {formatPeso(r.amount_centavos)}
                              </td>
                              <td className="py-1 text-right">
                                {r.status === "paid" ? (
                                  <span className="text-green-600">paid</span>
                                ) : overdue ? (
                                  <span className="font-medium text-red-600">
                                    overdue
                                  </span>
                                ) : (
                                  <span className="text-black/50 dark:text-white/50">
                                    due
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="mt-1 text-[11px] text-black/40 dark:text-white/40">
                      Payments are recorded by the operator when received.
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
