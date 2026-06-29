import { listSellerLoans } from "@/lib/loans/views";
import { getSellerExposure } from "@/lib/loans/credit";
import { sellerStats } from "@/lib/loans/stats";
import {
  getAccountProfile,
  getSellerProfileDetail,
} from "@/lib/profiles/account";
import MarketingKit from "@/components/invite/MarketingKit";
import ReferSellers from "@/components/invite/ReferSellers";
import { getConfig } from "@/lib/config/system-config";
import {
  markShippedAction,
  confirmHandoverAction,
} from "@/app/(public)/dashboard/actions";
import {
  updateAccountAction,
  updateSellerStorefrontAction,
} from "@/app/(public)/dashboard/profile-actions";
import { createChargeAction } from "@/app/(public)/charge/actions";
import PayoutTracker from "@/app/(public)/dashboard/PayoutTracker";
import PhotoActionForm from "@/app/(public)/dashboard/PhotoActionForm";
import ProfileEditor from "@/app/(public)/dashboard/ProfileEditor";
import SupportForm from "@/app/(public)/dashboard/SupportForm";
import { formatPeso, formatDate } from "@/lib/format";
import Card from "@/components/ui/Card";
import { Stat, StatGrid } from "@/components/ui/Stat";
import { Field, TextInput } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";
import {
  QrCode,
  Wallet,
  Banknote,
  TrendingUp,
  Package,
  Store,
  User,
  BadgeCheck,
  Megaphone,
} from "lucide-react";

/**
 * Seller dashboard. Leads with the money picture (gross sales, pending payout,
 * paid out, this month), then instant checkout via Datung Pay, the order list
 * (each with its payout tracker), growth tools, and an editable storefront +
 * account profile.
 */

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
              ["ship", "Ship", "Get paid after it's delivered", false],
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

function addDays(iso: string | null, days: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export default async function SellerPanel({
  userId,
  email,
}: {
  userId: string;
  email: string | null;
}) {
  const [loans, config, exposure, account, profile] = await Promise.all([
    listSellerLoans(userId),
    getConfig(),
    getSellerExposure(userId),
    getAccountProfile(userId, email),
    getSellerProfileDetail(userId),
  ]);

  const stats = sellerStats(loans, new Date().toISOString().slice(0, 7));

  return (
    <section className="space-y-8">
      {/* Money picture */}
      <StatGrid>
        <Stat
          label="Gross sales"
          value={formatPeso(stats.grossSalesCentavos)}
          hint={`${stats.totalOrders} order${stats.totalOrders === 1 ? "" : "s"}`}
          icon={TrendingUp}
        />
        <Stat
          label="Pending payout"
          tone="brand"
          value={formatPeso(stats.pendingPayoutCentavos)}
          hint={`${stats.activeOrders} in progress`}
          icon={Wallet}
        />
        <Stat
          label="Paid out"
          tone="accent"
          value={formatPeso(stats.paidOutCentavos)}
          hint={`${stats.completedOrders} completed`}
          icon={Banknote}
        />
        <Stat
          label="This month"
          value={formatPeso(stats.thisMonthSalesCentavos)}
          hint="gross sales"
          icon={Package}
        />
      </StatGrid>

      <NewSale />

      {/* Orders */}
      <div className="space-y-3">
        <SectionHeading icon={Package}>
          Your orders ({loans.length})
        </SectionHeading>

        {loans.length === 0 ? (
          <Card className="text-center text-sm text-black/55">
            No orders yet. Buyers who purchase from you will appear here.
          </Card>
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
                    Order from{" "}
                    <strong className="text-foreground">{l.buyerName}</strong> ·{" "}
                    {formatPeso(l.ticket_centavos)} · {l.tenor_months} months
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

                {l.status === "escrow_held" && l.handoverPending ? (
                  <div className="space-y-2.5 border-t border-black/5 pt-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                      <p className="font-medium">Hand over in person</p>
                      <p className="mt-0.5 text-xs text-amber-700/90">
                        Your payment is being kept safe by Datung. Give the item
                        to <strong>{l.buyerName}</strong>, then ask them to read the
                        6-digit code on their Datung screen and type it here to
                        release. Don&apos;t enter a code before handing the item
                        over.
                      </p>
                    </div>
                    <form
                      action={confirmHandoverAction}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="loanId" value={l.id} />
                      <Field label="Buyer's 6-digit code">
                        <TextInput
                          name="code"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={6}
                          pattern="[0-9]*"
                          placeholder="123456"
                          required
                          className="w-32 tracking-[0.3em]"
                        />
                      </Field>
                      <button
                        type="submit"
                        className={buttonClasses({ className: "bg-accent-600 hover:bg-accent-700" })}
                      >
                        Confirm hand-over
                      </button>
                    </form>
                  </div>
                ) : l.status === "escrow_held" ? (
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
      </div>

      {/* Growth tools */}
      <div className="space-y-3">
        <SectionHeading icon={Megaphone}>Grow your shop</SectionHeading>
        <MarketingKit sellerUserId={userId} />
        <ReferSellers sellerUserId={userId} />
      </div>

      {/* Profile / account */}
      <div className="space-y-3">
        <SectionHeading icon={Store}>Profile</SectionHeading>

        <ProfileEditor
          title="Storefront"
          icon={<Store />}
          description="How buyers recognise your shop."
          action={updateSellerStorefrontAction}
          fields={[
            {
              name: "social_handle",
              label: "Social handle",
              value: profile.socialHandle,
              placeholder: "@yourshop",
              optional: true,
            },
            {
              name: "marketplace_url",
              label: "Shop link",
              value: profile.marketplaceUrl,
              placeholder: "https://…",
              optional: true,
              inputMode: "url",
            },
            {
              name: "storefront_location",
              label: "Location",
              value: profile.storefrontLocation,
              placeholder: "e.g. Divisoria, Manila",
              optional: true,
            },
            {
              name: "selling_since",
              label: "Selling since",
              value: profile.sellingSince,
              placeholder: "e.g. 2019",
              optional: true,
            },
          ]}
          readOnly={[
            {
              label: "Verification",
              value: (
                <span className="inline-flex items-center gap-1 text-accent-700">
                  <BadgeCheck className="size-3.5" /> Verified
                </span>
              ),
            },
            { label: "Trust tier", value: titleCase(profile.trustTier) },
            {
              label: "Payout reserve",
              value: `${profile.rollingReservePct}%`,
            },
            {
              label: "Selling limit",
              value: formatPeso(exposure.limitCentavos),
            },
            {
              label: "Room to sell",
              value: formatPeso(exposure.availableCentavos),
            },
            {
              label: "Member since",
              value: formatDate(profile.memberSince ?? account.memberSince),
            },
          ]}
        />

        <ProfileEditor
          title="Account details"
          icon={<User />}
          description="How operators reach you."
          action={updateAccountAction}
          fields={[
            {
              name: "name",
              label: "Full name",
              value: account.name,
              placeholder: "Your name",
            },
            {
              name: "contact",
              label: "Contact (mobile / messenger)",
              value: account.contact,
              placeholder: "e.g. 0917…",
              optional: true,
              inputMode: "tel",
            },
          ]}
          readOnly={[{ label: "Email", value: account.email ?? "—" }]}
        />

        <p className="px-1 text-xs text-black/45">
          Your trust tier, reserve and selling limit are set by Datung and rise
          as you complete clean orders.
        </p>
        <SupportForm context="seller" defaultContact={account.contact} />
      </div>
    </section>
  );
}

function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: typeof Package;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-black/50">
      <Icon className="size-4 text-black/35" />
      {children}
    </h2>
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}
