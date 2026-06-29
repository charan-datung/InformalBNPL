import { CheckCircle2 } from "lucide-react";
import { installmentPenaltyCentavos } from "@/lib/loans/finance";
import { formatPeso, formatDate } from "@/lib/format";
import PayInstructions from "@/app/(public)/dashboard/PayInstructions";
import type { RepaymentLite } from "@/lib/loans/views";

/**
 * Buyer-facing repayment plan for a single order. Built for clarity: a progress
 * bar across the whole plan, a clearly-marked "pay this next" row with an inline
 * pay button, the principal/interest split per installment, and loud overdue
 * treatment with the running penalty. Pure presentation — the operator still
 * records payments when received.
 */
export default function RepaymentPlan({
  repayments,
  todayIso,
  penaltyRateMonthly,
}: {
  repayments: RepaymentLite[];
  todayIso: string;
  penaltyRateMonthly: number;
}) {
  // Ignore waived rows entirely — they're not part of what the buyer owes.
  const plan = repayments.filter((r) => r.status !== "waived");
  if (plan.length === 0) return null;

  const paid = plan.filter((r) => r.status === "paid");
  const paidCount = paid.length;
  const paidCentavos = paid.reduce((s, r) => s + r.amount_centavos, 0);
  const totalCentavos = plan.reduce((s, r) => s + r.amount_centavos, 0);
  const remainingCentavos = totalCentavos - paidCentavos;
  const pct = Math.round((paidCount / plan.length) * 100);

  // The single next unpaid installment gets the inline pay action + emphasis.
  const nextDueId = plan.find((r) => r.status !== "paid")?.id ?? null;

  return (
    <details className="group border-t border-black/5 pt-3" open={remainingCentavos > 0}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 text-xs font-semibold text-black/55 hover:text-black/80">
        <span>Payment plan</span>
        <span className="font-medium text-black/45">
          {paidCount}/{plan.length} paid
        </span>
      </summary>

      {/* Progress */}
      <div className="mt-2.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
          <div
            className="h-full rounded-full bg-accent-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-black/50">
          <span>
            <span className="font-semibold text-accent-700">
              {formatPeso(paidCentavos)}
            </span>{" "}
            paid
          </span>
          <span>
            {remainingCentavos > 0 ? (
              <>
                <span className="font-semibold text-foreground">
                  {formatPeso(remainingCentavos)}
                </span>{" "}
                to go
              </>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-accent-700">
                <CheckCircle2 className="size-3.5" /> Fully paid
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Installments */}
      <ul className="mt-3 space-y-1.5">
        {plan.map((r, i) => {
          const isPaid = r.status === "paid";
          const overdue = !isPaid && r.due_date < todayIso;
          const isNext = r.id === nextDueId;
          const penalty = overdue
            ? installmentPenaltyCentavos({
                amountCentavos: r.amount_centavos,
                dueDate: r.due_date,
                todayIso,
                penaltyRateMonthly,
              })
            : 0;
          const interest = r.interest_centavos ?? 0;
          const principal = r.principal_centavos ?? r.amount_centavos - interest;

          return (
            <li
              key={r.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                overdue
                  ? "border-red-200 bg-red-50"
                  : isNext
                    ? "border-brand-200 bg-brand-50/70"
                    : "border-black/[0.06] bg-white"
              }`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                  isPaid
                    ? "bg-accent-100 text-accent-700"
                    : overdue
                      ? "bg-red-100 text-red-700"
                      : "bg-black/[0.05] text-black/55"
                }`}
              >
                {isPaid ? <CheckCircle2 className="size-3.5" /> : i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold tabular-nums">
                    {formatPeso(r.amount_centavos + penalty)}
                  </span>
                  <span className="text-xs text-black/45">
                    {isPaid ? "paid" : "due"} {formatDate(r.due_date)}
                  </span>
                </div>
                <div className="text-[11px] text-black/45">
                  {formatPeso(principal)} principal + {formatPeso(interest)}{" "}
                  interest
                  {penalty > 0 ? (
                    <span className="font-medium text-red-600">
                      {" "}
                      + {formatPeso(penalty)} penalty
                    </span>
                  ) : null}
                </div>
              </div>

              {isNext ? (
                <PayInstructions
                  amountCentavos={r.amount_centavos + penalty}
                  label="Pay"
                  variant={overdue ? "primary" : "secondary"}
                  className="shrink-0"
                />
              ) : overdue ? (
                <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                  Overdue
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {remainingCentavos > 0 && plan.length - paidCount > 1 ? (
        <p className="mt-2 text-[11px] text-black/55">
          Want to finish early? You can pay the full{" "}
          <strong>{formatPeso(remainingCentavos)}</strong> remaining anytime —
          enter that amount when you submit your reference below.
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-black/40">
        Payments are recorded by your operator once received. Keep your receipt
        just in case.
      </p>
    </details>
  );
}
