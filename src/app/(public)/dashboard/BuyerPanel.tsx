import { listBuyerLoans, listVerifiedSellers } from "@/lib/loans/views";
import { getBuyerCredit } from "@/lib/loans/credit";
import { getConfig } from "@/lib/config/system-config";
import {
  confirmReceiptAction,
  reportProblemAction,
} from "@/app/(public)/dashboard/actions";
import Checkout from "@/app/(public)/dashboard/Checkout";
import PhotoActionForm from "@/app/(public)/dashboard/PhotoActionForm";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDateTime } from "@/lib/format";
import Card from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/Button";
import { QrCode, CheckCircle2 } from "lucide-react";

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
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white shadow-sm shadow-brand-950/20">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-white/60">
            Available credit
          </span>
          <span className="text-xs text-white/60">
            of {formatPeso(credit.limitCentavos)}
          </span>
        </div>
        <div className="mt-1 text-4xl font-bold tabular-nums">
          {formatPeso(credit.availableCentavos)}
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-accent-400"
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/70">
          <QrCode className="size-3.5" />
          Scan a seller&apos;s Datung Pay QR to buy instantly ·{" "}
          {formatPeso(credit.outstandingCentavos)} in use.
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
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-700">
            You owe
          </div>
          <div className="text-3xl font-bold tabular-nums text-amber-900">
            {formatPeso(totalDue)}
          </div>
          {nextOverall ? (
            <div className="text-sm text-amber-800">
              Next payment {formatPeso(nextOverall.amount_centavos)} due{" "}
              {nextOverall.due_date}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Active loans */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-black/50">
          Your purchases ({loans.length})
        </h2>
        {loans.length === 0 ? (
          <p className="text-sm text-black/55">No purchases yet.</p>
        ) : (
          loans.map((l) => {
            const reportDeadline = l.shippedAt
              ? addDays(l.shippedAt, config.dispute_window_days)
              : null;
            const reportOpen = reportDeadline
              ? new Date() < reportDeadline
              : false;

            return (
              <Card key={l.id} className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={l.status} />
                  <span className="font-semibold">
                    {formatPeso(l.ticket_centavos)}
                  </span>
                  <span className="text-black/55">
                    · {l.tenor_months}mo · from {l.sellerName}
                  </span>
                  <span className="ml-auto text-xs text-black/40">
                    {formatDateTime(l.created_at)}
                  </span>
                </div>

                {/* Shipped: confirm receipt (positive) or report a problem */}
                {l.status === "shipped" ? (
                  <div className="space-y-3 border-t border-black/5 pt-3">
                    <p className="text-black/65">
                      Your item is on the way. Once it arrives and everything
                      looks good, confirm receipt.
                    </p>
                    <form action={confirmReceiptAction}>
                      <input type="hidden" name="loanId" value={l.id} />
                      <button
                        type="submit"
                        className={buttonClasses({
                          className:
                            "w-full bg-accent-600 hover:bg-accent-700 sm:w-auto",
                        })}
                      >
                        <CheckCircle2 className="size-4" /> Confirm receipt — all
                        good
                      </button>
                    </form>

                    <details className="group">
                      <summary className="cursor-pointer text-xs text-black/50 hover:text-black/70">
                        Something wrong? Report a problem
                        {reportDeadline
                          ? ` (within ${config.dispute_window_days} days, until ${reportDeadline
                              .toISOString()
                              .slice(0, 10)})`
                          : ""}
                      </summary>
                      <div className="mt-3">
                        {reportOpen ? (
                          <PhotoActionForm
                            action={reportProblemAction}
                            loanId={l.id}
                            withReason
                            reasonPlaceholder="Describe the problem"
                            fileName="evidence"
                            fileLabel="Photo (required)"
                            fileHint="A clear photo of the problem helps us resolve it fast."
                            submitLabel="Submit report"
                            pendingLabel="Submitting…"
                            variant="danger"
                          />
                        ) : (
                          <p className="text-xs text-black/50">
                            The reporting window has closed for this order.
                          </p>
                        )}
                      </div>
                    </details>
                  </div>
                ) : null}

                {/* Repayment schedule + amounts due */}
                {l.repayments.length > 0 ? (
                  <div className="border-t border-black/5 pt-3">
                    <div className="mb-1 text-xs font-semibold text-black/50">
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
                              className="border-b border-black/5 last:border-0"
                            >
                              <td className="py-1 pr-3 text-black/40">{i + 1}</td>
                              <td className="py-1 pr-3 tabular-nums">
                                {r.due_date}
                              </td>
                              <td className="py-1 pr-3 text-right font-medium tabular-nums">
                                {formatPeso(r.amount_centavos)}
                              </td>
                              <td className="py-1 text-right">
                                {r.status === "paid" ? (
                                  <span className="font-medium text-accent-700">
                                    paid
                                  </span>
                                ) : overdue ? (
                                  <span className="font-medium text-red-600">
                                    overdue
                                  </span>
                                ) : (
                                  <span className="text-black/50">due</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="mt-1 text-[11px] text-black/40">
                      Payments are recorded by the operator when received.
                    </p>
                  </div>
                ) : null}
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
