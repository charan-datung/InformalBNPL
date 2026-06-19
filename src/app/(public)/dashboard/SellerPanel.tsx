import { listSellerLoans } from "@/lib/loans/views";
import { getConfig } from "@/lib/config/system-config";
import { markShippedAction } from "@/app/(public)/dashboard/actions";
import PayoutTracker from "@/app/(public)/dashboard/PayoutTracker";
import { formatPeso } from "@/lib/format";

/**
 * Seller dashboard. Each order leads with a payout tracker (Held → Shipped →
 * Delivered → Paying out) so the seller always sees where their money is. The
 * one action is "Mark as shipped", which requires a proof-of-shipment photo.
 */

function addDays(iso: string | null, days: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export default async function SellerPanel({ userId }: { userId: string }) {
  const [loans, config] = await Promise.all([
    listSellerLoans(userId),
    getConfig(),
  ]);

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
        Your orders ({loans.length})
      </h2>

      {loans.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No orders yet. Buyers who purchase from you will appear here.
        </p>
      ) : (
        loans.map((l) => {
          // Committed once escrow is released; estimated before that.
          let payoutDate: string | null = null;
          let payoutIsEstimate = true;
          if (l.releasedAt) {
            payoutDate = addDays(l.releasedAt, config.seller_payout_days);
            payoutIsEstimate = false;
          } else if (l.deliveredAt) {
            payoutDate = addDays(l.deliveredAt, config.seller_payout_days);
          } else if (l.shippedAt) {
            payoutDate = addDays(
              l.shippedAt,
              config.auto_release_days + config.seller_payout_days,
            );
          }

          return (
            <div
              key={l.id}
              className="space-y-4 rounded-lg border border-black/10 p-4 dark:border-white/10"
            >
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-black/60 dark:text-white/60">
                  Order from <strong>{l.buyerName}</strong> ·{" "}
                  {formatPeso(l.ticket_centavos)} · {l.tenor_months}mo
                </span>
              </div>

              <PayoutTracker
                status={l.status}
                netCentavos={l.netCentavos}
                feeCentavos={l.feeCentavos}
                merchantFeePct={l.merchant_fee_pct}
                payoutDate={payoutDate}
                payoutIsEstimate={payoutIsEstimate}
              />

              {l.status === "escrow_held" ? (
                <form
                  action={markShippedAction}
                  encType="multipart/form-data"
                  className="space-y-2 border-t border-black/5 pt-3 dark:border-white/5"
                >
                  <input type="hidden" name="loanId" value={l.id} />
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">
                      Proof of shipment (required)
                    </span>
                    <input
                      type="file"
                      name="proof"
                      accept="image/*"
                      capture="environment"
                      required
                      className="block text-xs"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                  >
                    Mark as shipped
                  </button>
                </form>
              ) : null}
            </div>
          );
        })
      )}
    </section>
  );
}
