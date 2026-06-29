import { Check } from "lucide-react";
import type { SellerLoanView } from "@/lib/loans/views";
import { formatDateTime } from "@/lib/format";

/**
 * Dated, confirmation-first timeline of a seller's order — the post-transaction
 * "what happened and what's next" overview. Completed milestones show a green
 * check + the exact timestamp; the current step is highlighted with its expected
 * action; later steps are muted. Non-happy paths (dispute/refund/hold) replace
 * the tail with a clear status.
 */

type Step = {
  label: string;
  doneAt: string | null;
  /** Shown under the label when this step is the current (next) one. */
  pendingHint?: string;
};

export default function SellerOrderTimeline({
  order,
  payoutDate,
}: {
  order: SellerLoanView;
  payoutDate: string | null;
}) {
  const fulfilled = order.isInPerson
    ? {
        label: "Handed over to buyer",
        doneAt: order.handoverConfirmedAt,
        pendingHint: "Enter the buyer's 6-digit code to confirm the hand-over.",
      }
    : {
        label: "Shipped",
        doneAt: order.shippedAt,
        pendingHint: "Mark the order shipped (with a photo) to start the clock.",
      };

  const steps: Step[] = [
    {
      label: "Payment secured",
      doneAt: order.paidAt ?? order.created_at,
      pendingHint: "Waiting for the buyer to pay.",
    },
    fulfilled,
    {
      label: "Delivery confirmed",
      doneAt: order.deliveredAt,
      pendingHint: "Buyer confirms receipt (or it auto-confirms after the window).",
    },
    {
      label: "Released for payout",
      doneAt: order.releasedAt,
      pendingHint: "Datung clears the order for payout.",
    },
    {
      label: "Paid out",
      doneAt: order.settledAt,
      pendingHint: payoutDate
        ? `Expected around ${formatDateTime(payoutDate)}.`
        : "After release.",
    },
  ];

  // Non-happy endings: show a clear terminal note instead of the payout tail.
  const ended =
    order.status === "refunded"
      ? { text: "Refunded to buyer — no payout for this order.", cls: "text-orange-700" }
      : order.status === "dispute_raised"
        ? { text: "Buyer reported a problem — payout paused until it's resolved.", cls: "text-amber-700" }
        : order.status === "frozen_fraud_review"
          ? { text: "On hold for review.", cls: "text-rose-700" }
          : null;

  const currentIndex = steps.findIndex((s) => !s.doneAt);

  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const done = Boolean(s.doneAt);
        const current = !done && i === currentIndex && !ended;
        const isLast = i === steps.length - 1;
        return (
          <li key={s.label} className="flex gap-3">
            {/* Rail */}
            <div className="flex flex-col items-center">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  done
                    ? "bg-accent-600 text-white"
                    : current
                      ? "bg-brand-700 text-white"
                      : "bg-black/[0.07] text-black/40"
                }`}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              {!isLast ? (
                <span
                  className={`w-px flex-1 ${done ? "bg-accent-300" : "bg-black/10"}`}
                />
              ) : null}
            </div>
            {/* Body */}
            <div className={`pb-5 ${isLast ? "pb-0" : ""}`}>
              <div
                className={`text-sm font-medium ${
                  done || current ? "text-foreground" : "text-black/40"
                }`}
              >
                {s.label}
              </div>
              {done ? (
                <div className="text-xs text-accent-700">
                  {formatDateTime(s.doneAt!)}
                </div>
              ) : current ? (
                <div className="text-xs text-black/55">{s.pendingHint}</div>
              ) : (
                <div className="text-xs text-black/35">{s.pendingHint}</div>
              )}
            </div>
          </li>
        );
      })}

      {ended ? (
        <li className={`pt-1 text-xs font-medium ${ended.cls}`}>{ended.text}</li>
      ) : null}
    </ol>
  );
}
