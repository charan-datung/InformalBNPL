import { listSellerLoans } from "@/lib/loans/views";
import { markShippedAction } from "@/app/(public)/dashboard/actions";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDateTime } from "@/lib/format";

/**
 * Seller side of the dashboard: the seller's orders, with a "Mark shipped"
 * action once the operator has held escrow. The rest of the escrow workflow
 * (release, repayment) stays with the operator.
 */
export default async function SellerPanel({ userId }: { userId: string }) {
  const loans = await listSellerLoans(userId);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
        Your orders ({loans.length})
      </h2>
      {loans.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No orders yet. Buyers who purchase from you will appear here.
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
                · {l.tenor_months}mo · buyer {l.counterpartyName}
              </span>
              <span className="ml-auto text-xs text-black/40 dark:text-white/40">
                {formatDateTime(l.created_at)}
              </span>
            </div>

            {/* Seller can mark shipped once the operator is holding escrow. */}
            {l.status === "escrow_held" ? (
              <form
                action={markShippedAction}
                className="mt-3 border-t border-black/5 pt-3 dark:border-white/5"
              >
                <input type="hidden" name="loanId" value={l.id} />
                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                >
                  Mark shipped
                </button>
              </form>
            ) : null}
          </div>
        ))
      )}
    </section>
  );
}
