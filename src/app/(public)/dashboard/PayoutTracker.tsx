import type { LoanStatus } from "@/lib/loans/state-machine";
import { formatPeso, formatDateTime } from "@/lib/format";

/**
 * Seller payout tracker — the centerpiece of the seller dashboard. A seller
 * must always be able to see where their money is: Held → Shipped → Delivered →
 * Paying out, with the net-of-fee amount and the committed/estimated payout
 * date front and centre.
 */

const STEPS = ["Held", "Shipped", "Delivered", "Paying out"] as const;

function stepIndex(status: LoanStatus): number {
  switch (status) {
    case "booked":
    case "escrow_held":
      return 0;
    case "shipped":
      return 1;
    case "delivered_confirmed":
    case "auto_released":
    case "dispute_raised":
      return 2;
    case "escrow_released":
    case "repaying":
    case "settled":
      return 3;
    default:
      return 0;
  }
}

/** A non-happy-path banner, or null. */
function banner(status: LoanStatus): { text: string; cls: string } | null {
  switch (status) {
    case "dispute_raised":
      return {
        text: "Problem reported by buyer — payout on hold until resolved.",
        cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
      };
    case "refunded":
      return {
        text: "Refunded to buyer — no payout for this order.",
        cls: "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
      };
    case "frozen_fraud_review":
      return {
        text: "On hold — under review.",
        cls: "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
      };
    default:
      return null;
  }
}

export default function PayoutTracker({
  status,
  netCentavos,
  feeCentavos,
  merchantFeePct,
  payoutDate,
  payoutIsEstimate,
}: {
  status: LoanStatus;
  netCentavos: number;
  feeCentavos: number;
  merchantFeePct: number;
  payoutDate: string | null;
  payoutIsEstimate: boolean;
}) {
  const current = stepIndex(status);
  const settled = status === "settled";
  const note = banner(status);

  return (
    <div className="space-y-4">
      {/* Money: where the seller's money is */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-black/40 dark:text-white/40">
            Net payout
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {formatPeso(netCentavos)}
          </div>
          <div className="text-xs text-black/50 dark:text-white/50">
            after {merchantFeePct}% fee ({formatPeso(feeCentavos)})
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-black/40 dark:text-white/40">
            {settled
              ? "Paid out"
              : payoutIsEstimate
                ? "Estimated payout"
                : "Committed payout"}
          </div>
          <div className="text-lg font-medium">
            {payoutDate ? formatDateTime(payoutDate) : "After delivery"}
          </div>
        </div>
      </div>

      {/* Stepper */}
      <ol className="flex items-center">
        {STEPS.map((label, i) => {
          const done = i < current || settled;
          const active = i === current && !settled;
          return (
            <li key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    done
                      ? "bg-green-600 text-white"
                      : active
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "bg-black/10 text-black/40 dark:bg-white/10 dark:text-white/40"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span
                  className={`mt-1 whitespace-nowrap text-[11px] ${
                    done || active
                      ? "font-medium"
                      : "text-black/40 dark:text-white/40"
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 ? (
                <span
                  className={`mx-1 h-0.5 flex-1 ${
                    i < current || settled
                      ? "bg-green-600"
                      : "bg-black/10 dark:bg-white/10"
                  }`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {note ? (
        <p className={`rounded-md px-3 py-2 text-sm ${note.cls}`}>{note.text}</p>
      ) : null}
    </div>
  );
}
