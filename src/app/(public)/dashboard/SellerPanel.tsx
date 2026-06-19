import { listSellerLoans } from "@/lib/loans/views";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDateTime } from "@/lib/format";

/**
 * Seller side of the dashboard: read-only view of orders the seller is party
 * to. In the pilot the operator drives the escrow workflow (mark shipped,
 * release), so there are no seller actions here yet.
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
            className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/10"
          >
            <StatusBadge status={l.status} />
            <span className="font-medium">{formatPeso(l.ticket_centavos)}</span>
            <span className="text-black/60 dark:text-white/60">
              · {l.tenor_months}mo · buyer {l.counterpartyName}
            </span>
            <span className="ml-auto text-xs text-black/40 dark:text-white/40">
              {formatDateTime(l.created_at)}
            </span>
          </div>
        ))
      )}
    </section>
  );
}
