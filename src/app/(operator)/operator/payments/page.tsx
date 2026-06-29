import Link from "next/link";
import { listPendingPayments } from "@/lib/payments/buyer-payments";
import {
  confirmPaymentAction,
  rejectPaymentAction,
} from "@/app/(operator)/operator/actions";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Buyer payment confirmation queue. Buyers report a payment with its reference #;
 * the operator checks it against the bank/e-wallet record, then confirms (which
 * allocates it across the loan's open installments) or rejects it.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const payments = await listPendingPayments();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Payments to confirm ({payments.length})</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Match each reference against your GCash/Maya/bank record before
          confirming. Confirming applies the amount to the buyer&apos;s
          installments (oldest first); partial amounts are fine.
        </p>
      </div>

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

      {payments.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          No payments waiting for confirmation.
        </p>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <div
              key={p.id}
              className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-lg font-bold tabular-nums">
                  {formatPeso(p.amount_centavos)}
                </span>
                <span className="text-black/55 dark:text-white/55">
                  from <strong>{p.buyerName}</strong> · {p.method ?? "—"} · ref{" "}
                  <span className="font-mono">{p.reference_no ?? "—"}</span>
                </span>
                <span className="ml-auto text-xs text-black/40 dark:text-white/40">
                  {formatDateTime(p.created_at)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-black/55 dark:text-white/55 sm:grid-cols-4">
                <span>
                  Seller: <strong className="text-foreground">{p.sellerName}</strong>
                </span>
                <span>Order: {formatPeso(p.ticket_centavos)}</span>
                <span>Outstanding: {formatPeso(p.outstanding_centavos)}</span>
                <Link
                  href={`/operator/loans/${p.loan_id}`}
                  className="underline underline-offset-4"
                >
                  Loan details
                </Link>
              </div>
              {p.proofUrl ? (
                <a
                  href={p.proofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline underline-offset-4"
                >
                  View payment screenshot →
                </a>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <form action={confirmPaymentAction}>
                  <input type="hidden" name="paymentId" value={p.id} />
                  <button
                    type="submit"
                    className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
                  >
                    Confirm &amp; apply {formatPeso(p.amount_centavos)}
                  </button>
                </form>
                <form action={rejectPaymentAction} className="flex items-center gap-2">
                  <input type="hidden" name="paymentId" value={p.id} />
                  <input
                    type="text"
                    name="note"
                    placeholder="Reason (optional)"
                    className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/15 dark:bg-transparent"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium text-black/70 hover:bg-black/[0.03] dark:border-white/15 dark:text-white/70"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
