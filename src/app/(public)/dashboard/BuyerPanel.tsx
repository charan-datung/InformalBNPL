import { listBuyerLoans, listVerifiedSellers } from "@/lib/loans/views";
import {
  createPurchaseAction,
  confirmDeliveryAction,
  raiseDisputeAction,
} from "@/app/(public)/dashboard/actions";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDateTime } from "@/lib/format";

/**
 * Buyer side of the dashboard: start a purchase (books a loan that lands in the
 * operator queue), see your loans, and act on shipped ones (confirm delivery or
 * raise a dispute, which opens a dispute in the operator queue).
 */
export default async function BuyerPanel({ userId }: { userId: string }) {
  const [loans, sellers] = await Promise.all([
    listBuyerLoans(userId),
    listVerifiedSellers(),
  ]);

  return (
    <div className="space-y-6">
      {/* New purchase */}
      <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="font-semibold">New purchase</h2>
        {sellers.length === 0 ? (
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            No verified sellers are available yet.
          </p>
        ) : (
          <form
            action={createPurchaseAction}
            className="mt-3 grid gap-3 sm:grid-cols-4"
          >
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium">Seller</span>
              <select
                name="seller_user_id"
                required
                className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
              >
                {sellers.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.name}
                    {s.socialHandle ? ` (${s.socialHandle})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Amount (PHP)</span>
              <input
                type="number"
                name="amount_pesos"
                min={1}
                step="1"
                required
                className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Tenor (months)</span>
              <input
                type="number"
                name="tenor_months"
                min={1}
                max={24}
                step="1"
                defaultValue={3}
                required
                className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
              />
            </label>
            <div className="sm:col-span-4">
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                Request purchase
              </button>
            </div>
          </form>
        )}
        <p className="mt-2 text-xs text-black/40 dark:text-white/40">
          Interest and merchant fee are applied from system settings at booking.
          The app records state only — no money moves here.
        </p>
      </section>

      {/* Your loans */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Your purchases ({loans.length})
        </h2>
        {loans.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            No purchases yet.
          </p>
        ) : (
          loans.map((l) => (
            <div
              key={l.id}
              className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/10"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={l.status} />
                <span className="font-medium">{formatPeso(l.ticket_centavos)}</span>
                <span className="text-black/60 dark:text-white/60">
                  · {l.tenor_months}mo · seller {l.counterpartyName}
                </span>
                <span className="ml-auto text-xs text-black/40 dark:text-white/40">
                  {formatDateTime(l.created_at)}
                </span>
              </div>

              {/* Buyer actions only when the item has been shipped. */}
              {l.status === "shipped" ? (
                <div className="mt-3 space-y-2 border-t border-black/5 pt-3 dark:border-white/5">
                  <form action={confirmDeliveryAction}>
                    <input type="hidden" name="loanId" value={l.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
                    >
                      Confirm delivery
                    </button>
                  </form>

                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-red-700 dark:text-red-400">
                      Raise a dispute
                    </summary>
                    <form
                      action={raiseDisputeAction}
                      encType="multipart/form-data"
                      className="mt-2 space-y-2"
                    >
                      <input type="hidden" name="loanId" value={l.id} />
                      <textarea
                        name="reason"
                        required
                        rows={2}
                        placeholder="What went wrong?"
                        className="w-full rounded-md border border-black/15 px-3 py-1.5 text-xs dark:border-white/15 dark:bg-transparent"
                      />
                      <input
                        type="file"
                        name="evidence"
                        accept="image/*"
                        capture="environment"
                        className="block text-xs"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        Submit dispute
                      </button>
                    </form>
                  </details>
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
