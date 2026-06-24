import { listSellerLoans } from "@/lib/loans/views";
import InviteBuyers from "@/app/(public)/dashboard/InviteBuyers";
import { getConfig } from "@/lib/config/system-config";
import { markShippedAction } from "@/app/(public)/dashboard/actions";
import { createChargeAction } from "@/app/(public)/charge/actions";
import PayoutTracker from "@/app/(public)/dashboard/PayoutTracker";
import { formatPeso } from "@/lib/format";

/** Datung Pay: mint a Payment Request (QR + exclusive link) for a sale. */
function NewSale() {
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 dark:border-white/10 dark:bg-brand-950/40">
      <h2 className="font-semibold text-brand-800 dark:text-brand-100">New sale</h2>
      <p className="mt-0.5 text-xs text-black/55 dark:text-white/55">
        Enter the amount — we&apos;ll make a QR and an exclusive link for the buyer
        to pay with their Datung credit.
      </p>
      <form action={createChargeAction} className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium">Amount (PHP)</span>
            <input
              type="number"
              name="amount_pesos"
              min={1}
              step="1"
              required
              inputMode="numeric"
              className="w-full rounded-md border border-black/15 bg-white px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">
              What for? <span className="text-black/40 dark:text-white/40">(optional)</span>
            </span>
            <input
              type="text"
              name="memo"
              placeholder="e.g. 2 ukay bundles"
              className="w-full rounded-md border border-black/15 bg-white px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </label>
        </div>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="fulfillment" value="in_person" defaultChecked />
            In-person (hand over now)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="fulfillment" value="ship" />
            Ship (escrow until delivered)
          </label>
        </fieldset>
        <button
          type="submit"
          className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Generate QR / link
        </button>
      </form>
    </div>
  );
}

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
      <NewSale />
      <InviteBuyers sellerUserId={userId} />

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
