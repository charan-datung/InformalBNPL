import { listSellerLoans } from "@/lib/loans/views";
import MarketingKit from "@/components/invite/MarketingKit";
import ReferSellers from "@/components/invite/ReferSellers";
import { getConfig } from "@/lib/config/system-config";
import { markShippedAction } from "@/app/(public)/dashboard/actions";
import { createChargeAction } from "@/app/(public)/charge/actions";
import PayoutTracker from "@/app/(public)/dashboard/PayoutTracker";
import PhotoActionForm from "@/app/(public)/dashboard/PhotoActionForm";
import { formatPeso } from "@/lib/format";
import Card from "@/components/ui/Card";
import { Field, TextInput } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";
import { QrCode } from "lucide-react";

/** Datung Pay: mint a Payment Request (QR + exclusive link) for a sale. */
function NewSale() {
  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5">
      <h2 className="flex items-center gap-2 font-semibold text-brand-800">
        <QrCode className="size-4.5" /> New sale
      </h2>
      <p className="mt-0.5 text-xs text-black/55">
        Enter the amount — we&apos;ll make a QR and an exclusive link for the
        buyer to pay with their Datung credit.
      </p>
      <form action={createChargeAction} className="mt-4 space-y-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (PHP)">
            <TextInput
              type="number"
              name="amount_pesos"
              min={1}
              step="1"
              required
              inputMode="numeric"
            />
          </Field>
          <Field label="What for?" optional>
            <TextInput type="text" name="memo" placeholder="e.g. 2 ukay bundles" />
          </Field>
        </div>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["in_person", "In-person", "Hand over now", true],
              ["ship", "Ship", "Escrow until delivered", false],
            ] as [string, string, string, boolean][]
          ).map(([value, label, desc, checked]) => (
            <label
              key={value}
              className="group flex cursor-pointer items-start gap-2 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
            >
              <input
                type="radio"
                name="fulfillment"
                value={value}
                defaultChecked={checked}
                className="mt-0.5 accent-brand-600"
              />
              <span>
                <span className="block font-medium text-foreground">{label}</span>
                <span className="block text-xs text-black/50">{desc}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button type="submit" className={buttonClasses({ className: "w-full sm:w-auto" })}>
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
    <section className="space-y-5">
      <NewSale />
      <MarketingKit sellerUserId={userId} />
      <ReferSellers sellerUserId={userId} />

      <h2 className="text-sm font-semibold text-black/50">
        Your orders ({loans.length})
      </h2>

      {loans.length === 0 ? (
        <p className="text-sm text-black/55">
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
            <Card key={l.id} className="space-y-4">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-black/55">
                  Order from <strong className="text-foreground">{l.buyerName}</strong>{" "}
                  · {formatPeso(l.ticket_centavos)} · {l.tenor_months}mo
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
                <div className="border-t border-black/5 pt-3">
                  <PhotoActionForm
                    action={markShippedAction}
                    loanId={l.id}
                    fileName="proof"
                    fileLabel="Proof of shipment (required)"
                    fileHint="A photo of the parcel or hand-off. On a phone this opens the camera."
                    submitLabel="Mark as shipped"
                    pendingLabel="Submitting…"
                  />
                </div>
              ) : null}
            </Card>
          );
        })
      )}
    </section>
  );
}
