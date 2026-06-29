import Link from "next/link";
import { listBuyerLoans, listVerifiedSellers } from "@/lib/loans/views";
import { getBuyerCredit } from "@/lib/loans/credit";
import { buyerStats, type UpcomingPayment } from "@/lib/loans/stats";
import { getConfig } from "@/lib/config/system-config";
import {
  getAccountProfile,
  getBuyerProfileDetail,
} from "@/lib/profiles/account";
import {
  confirmReceiptAction,
  reportProblemAction,
} from "@/app/(public)/dashboard/actions";
import { updateAccountAction } from "@/app/(public)/dashboard/profile-actions";
import Checkout from "@/app/(public)/dashboard/Checkout";
import PhotoActionForm from "@/app/(public)/dashboard/PhotoActionForm";
import ProfileEditor from "@/app/(public)/dashboard/ProfileEditor";
import SupportForm from "@/app/(public)/dashboard/SupportForm";
import PayInstructions from "@/app/(public)/dashboard/PayInstructions";
import ScanToPay from "@/app/(public)/dashboard/ScanToPay";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDate, formatDateTime } from "@/lib/format";
import Card from "@/components/ui/Card";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { buttonClasses } from "@/components/ui/Button";
import {
  QrCode,
  CheckCircle2,
  CalendarClock,
  Wallet,
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  User,
} from "lucide-react";

/**
 * Buyer dashboard. Organised like a consumer BNPL app: a spending-power hero,
 * headline numbers, the next bill front-and-centre, instant checkout, a unified
 * upcoming-payments view across every order, the order history, and an editable
 * profile/account section.
 */

function addDays(iso: string, days: number): Date {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default async function BuyerPanel({
  userId,
  email,
}: {
  userId: string;
  email: string | null;
}) {
  const [loans, sellers, credit, config, account, profile] = await Promise.all([
    listBuyerLoans(userId),
    listVerifiedSellers(),
    getBuyerCredit(userId),
    getConfig(),
    getAccountProfile(userId, email),
    getBuyerProfileDetail(userId),
  ]);

  const stats = buyerStats(loans, todayIso(), config.penalty_rate_monthly);
  const usedPct =
    credit.limitCentavos > 0
      ? Math.round((credit.outstandingCentavos / credit.limitCentavos) * 100)
      : 0;

  return (
    <div className="space-y-8">
      {/* Spending power — the heart of repeat instant checkout */}
      <section className="space-y-4">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white shadow-sm shadow-brand-950/20">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-white/60">
              Available to spend
            </span>
            <span className="text-xs text-white/60">
              of {formatPeso(credit.limitCentavos)} limit
            </span>
          </div>
          <div className="mt-1 text-4xl font-bold tabular-nums">
            {formatPeso(credit.availableCentavos)}
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-accent-400 transition-all"
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/70">
            <span className="flex items-center gap-1.5">
              <QrCode className="size-3.5" />
              Shop now, pay hulugan — use it across any Datung seller
            </span>
            {stats.onTimePct !== null ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-medium text-white/90">
                <TrendingUp className="size-3" /> {stats.onTimePct}% on-time
              </span>
            ) : (
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-medium text-white/90">
                New buyer
              </span>
            )}
          </div>
        </div>

        {/* Two focal points, balanced: pay (scan) and what's owed (next bill). */}
        <div className="grid gap-3 sm:grid-cols-2">
          <ScanToPay />
          <NextBillCard next={stats.nextPayment} />
        </div>

        {/* Headline numbers — secondary to the two focal cards above */}
        <StatGrid>
          <Stat
            label="You owe"
            tone={stats.totalOwedCentavos > 0 ? "amber" : "default"}
            value={formatPeso(stats.totalOwedCentavos)}
            hint={`across ${stats.activeOrders} active order${stats.activeOrders === 1 ? "" : "s"}`}
            icon={Wallet}
          />
          <Stat
            label="Paid to date"
            tone="accent"
            value={formatPeso(stats.totalPaidCentavos)}
            hint={`${stats.installmentsPaid} payment${stats.installmentsPaid === 1 ? "" : "s"}`}
            icon={CheckCircle2}
          />
          <Stat
            label="Orders"
            value={loans.length}
            hint={`${stats.completedOrders} completed`}
            icon={ShoppingBag}
          />
        </StatGrid>

        {/* Overdue gets its own loud banner */}
        {stats.overdueCount > 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertTriangle className="size-4.5 shrink-0 text-red-500" />
            <span>
              You have{" "}
              <strong>
                {stats.overdueCount} overdue payment
                {stats.overdueCount === 1 ? "" : "s"}
              </strong>
              {stats.totalPenaltyCentavos > 0 ? (
                <>
                  {" "}
                  with <strong>{formatPeso(stats.totalPenaltyCentavos)}</strong>{" "}
                  in penalties accrued ({(config.penalty_rate_monthly * 100).toFixed(0)}%/month)
                </>
              ) : null}
              . Settle with your operator to keep your credit healthy.
            </span>
          </div>
        ) : null}
      </section>

      {/* Manual checkout — secondary to scanning a seller's QR. Tucked into a
          disclosure so the home stays focused on the two cards above. */}
      <details className="group rounded-2xl border border-black/10 bg-white">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-5 py-4 text-sm font-medium text-foreground">
          <span className="flex items-center gap-2">
            <ShoppingBag className="size-4 text-black/35" />
            Buy from a seller manually
          </span>
          <span className="text-xs font-normal text-black/45 group-open:hidden">
            No QR? Tap to pick a seller
          </span>
        </summary>
        <div className="border-t border-black/5 p-4 sm:p-5">
          <Checkout
            sellers={sellers}
            monthlyRate={config.default_interest_rate_monthly}
            processingFeePct={config.processing_fee_pct}
            penaltyRateMonthly={config.penalty_rate_monthly}
            defaultTenor={config.default_tenor_months}
            maxTenor={config.max_tenor_months}
            creditLimitCentavos={credit.availableCentavos}
          />
        </div>
      </details>

      {/* Unified upcoming payments across every order */}
      {stats.upcoming.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <SectionHeading icon={CalendarClock}>
              Upcoming payments
            </SectionHeading>
            {stats.nextPayment ? (
              <PayInstructions
                amountCentavos={stats.nextPayment.amountCentavos}
                label="Pay next"
              />
            ) : null}
          </div>
          <Card className="divide-y divide-black/5 p-0">
            {stats.upcoming.slice(0, 6).map((p, i) => (
              <div
                key={`${p.loanId}-${i}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.sellerName}</div>
                  <div className="text-xs text-black/50">
                    {formatDate(p.dueDate)}
                  </div>
                  {p.penaltyCentavos > 0 ? (
                    <div className="text-xs font-medium text-red-600">
                      + {formatPeso(p.penaltyCentavos)} penalty
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold tabular-nums">
                    {formatPeso(p.amountCentavos + p.penaltyCentavos)}
                  </span>
                  {p.overdue ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                      Overdue
                    </span>
                  ) : (
                    <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-black/50">
                      Due
                    </span>
                  )}
                  <PayInstructions
                    amountCentavos={p.amountCentavos + p.penaltyCentavos}
                    label="Pay"
                    variant="secondary"
                  />
                </div>
              </div>
            ))}
            {stats.upcoming.length > 6 ? (
              <div className="px-4 py-2 text-center text-xs text-black/45">
                +{stats.upcoming.length - 6} more scheduled
              </div>
            ) : null}
          </Card>
        </section>
      ) : null}

      {/* Order history */}
      <section className="space-y-3">
        <SectionHeading icon={ShoppingBag}>
          Your purchases ({loans.length})
        </SectionHeading>
        {loans.length === 0 ? (
          <Card className="text-center text-sm text-black/55">
            No purchases yet. Scan a seller&apos;s QR or pick one above to make
            your first one.
          </Card>
        ) : (
          loans.map((l) => {
            const reportDeadline = l.shippedAt
              ? addDays(l.shippedAt, config.dispute_window_days)
              : null;
            const reportOpen = reportDeadline
              ? new Date() < reportDeadline
              : false;
            const plan = l.repayments.filter((r) => r.status !== "waived");
            const paid = plan.filter((r) => r.status === "paid").length;

            return (
              <Card key={l.id} className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={l.status} audience="customer" />
                  <span className="font-semibold">
                    {formatPeso(l.ticket_centavos)}
                  </span>
                  <span className="text-black/55">
                    · {l.tenor_months} months · from {l.sellerName}
                  </span>
                  <span className="ml-auto text-xs text-black/40">
                    {formatDateTime(l.created_at)}
                  </span>
                </div>

                {/* In-person hand-over: show the code the seller must enter */}
                {l.status === "escrow_held" && l.handoverCode ? (
                  <div className="space-y-2 border-t border-black/5 pt-3">
                    <p className="text-black/65">
                      Show this code to <strong>{l.sellerName}</strong> only
                      after you have the item in hand. They&apos;ll type it to
                      complete the hand-over.
                    </p>
                    <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-brand-700/70">
                        Hand-over code
                      </div>
                      <div className="mt-0.5 font-mono text-3xl font-bold tracking-[0.4em] text-brand-800">
                        {l.handoverCode}
                      </div>
                    </div>
                    <p className="text-xs text-black/45">
                      Keep this private until you&apos;ve received the item.
                      Sharing it early lets the seller get paid before you do.
                    </p>
                  </div>
                ) : null}

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

                {/* Repayment schedule — collapsed to keep the list scannable */}
                {plan.length > 0 ? (
                  <details className="group border-t border-black/5 pt-3">
                    <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold text-black/55 hover:text-black/80">
                      <span>Payment plan</span>
                      <span className="font-medium text-black/45">
                        {paid}/{plan.length} paid
                      </span>
                    </summary>
                    <table className="mt-2 w-full">
                      <tbody>
                        {plan.map((r, i) => {
                          const overdue =
                            r.status !== "paid" && r.due_date < todayIso();
                          return (
                            <tr
                              key={r.id}
                              className="border-b border-black/5 last:border-0"
                            >
                              <td className="py-1 pr-3 text-black/40">{i + 1}</td>
                              <td className="py-1 pr-3 tabular-nums">
                                {formatDate(r.due_date)}
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
                                    late
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
                  </details>
                ) : null}

                <Link
                  href={`/loan/${l.id}/documents`}
                  className="inline-block border-t border-black/5 pt-3 text-xs font-medium text-brand-700 underline-offset-4 hover:underline"
                >
                  View loan agreement &amp; disclosure
                </Link>
              </Card>
            );
          })
        )}
      </section>

      {/* Profile / account */}
      <section className="space-y-3">
        <SectionHeading icon={User}>Profile</SectionHeading>
        <ProfileEditor
          title="Account details"
          icon={<User />}
          description="How sellers and operators reach you."
          action={updateAccountAction}
          fields={[
            {
              name: "name",
              label: "Full name",
              value: account.name,
              placeholder: "Your name",
            },
            {
              name: "contact",
              label: "Contact (mobile / messenger)",
              value: account.contact,
              placeholder: "e.g. 0917…",
              optional: true,
              inputMode: "tel",
            },
          ]}
          readOnly={[
            { label: "Email", value: account.email ?? "—" },
            {
              label: "Buyer status",
              value: (
                <span className="inline-flex items-center gap-1 text-accent-700">
                  <CheckCircle2 className="size-3.5" /> Verified
                </span>
              ),
            },
            {
              label: "Credit limit",
              value: formatPeso(profile.creditLimitCentavos),
            },
            {
              label: "Available",
              value: formatPeso(credit.availableCentavos),
            },
            ...(profile.buyerKind
              ? [
                  {
                    label: "Account type",
                    value: titleCase(profile.buyerKind),
                  },
                ]
              : []),
            {
              label: "Member since",
              value: formatDate(profile.memberSince ?? account.memberSince),
            },
          ]}
        />
        <p className="px-1 text-xs text-black/45">
          Your credit limit is set during underwriting. Need a higher limit? Ask
          your operator.
        </p>
        <SupportForm context="buyer" defaultContact={account.contact} />
      </section>
    </div>
  );
}

/**
 * The single most urgent bill, given equal billing with the pay action. Shows a
 * reassuring "all caught up" state when nothing is due, and turns red when the
 * next installment is overdue.
 */
function NextBillCard({ next }: { next: UpcomingPayment | null }) {
  if (!next) {
    return (
      <div className="flex flex-col justify-center rounded-2xl border border-black/10 bg-white p-5 text-center">
        <CheckCircle2 className="mx-auto size-7 text-accent-500" />
        <p className="mt-1.5 text-sm font-medium text-foreground">
          You&apos;re all caught up
        </p>
        <p className="text-xs text-black/45">No payments due right now.</p>
      </div>
    );
  }

  const total = next.amountCentavos + next.penaltyCentavos;

  return (
    <div
      className={`flex flex-col justify-between rounded-2xl border p-5 ${
        next.overdue
          ? "border-red-200 bg-red-50"
          : "border-brand-100 bg-brand-50/60"
      }`}
    >
      <div>
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-black/50">
          <CalendarClock className="size-3.5" />
          {next.overdue ? "Overdue payment" : "Next payment"}
        </span>
        <div className="mt-1 text-3xl font-bold tabular-nums text-foreground">
          {formatPeso(total)}
        </div>
        <div className="mt-0.5 text-xs text-black/55">
          {next.sellerName} · due {formatDate(next.dueDate)}
          {next.penaltyCentavos > 0
            ? ` · incl. ${formatPeso(next.penaltyCentavos)} penalty`
            : ""}
        </div>
      </div>
      <div className="mt-3">
        <PayInstructions
          amountCentavos={total}
          label="Pay this bill"
          variant={next.overdue ? "primary" : "secondary"}
        />
      </div>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: typeof ShoppingBag;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-black/50">
      <Icon className="size-4 text-black/35" />
      {children}
    </h2>
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}
