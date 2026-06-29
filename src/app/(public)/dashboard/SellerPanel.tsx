import Link from "next/link";
import { listSellerLoans, type SellerLoanView } from "@/lib/loans/views";
import { getSellerExposure } from "@/lib/loans/credit";
import { sellerPayoutInfo } from "@/lib/loans/payout";
import { sellerStats } from "@/lib/loans/stats";
import {
  getAccountProfile,
  getSellerProfileDetail,
} from "@/lib/profiles/account";
import MarketingKit from "@/components/invite/MarketingKit";
import ReferSellers from "@/components/invite/ReferSellers";
import { getConfig, type SystemConfig } from "@/lib/config/system-config";
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
import PasskeySetup from "@/components/auth/PasskeySetup";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDate, formatDateTime } from "@/lib/format";
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
  ShieldCheck,
  CalendarClock,
} from "lucide-react";

/**
 * Seller dashboard. Organised into zones: a "get paid" hero (money on the way +
 * the next expected payout), the primary New Sale action, a slim numbers row,
 * orders that need the seller to act surfaced first, the full order list, growth
 * tools, and an editable storefront + account profile.
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
          <Field label="What for?">
            <TextInput
              type="text"
              name="memo"
              required
              maxLength={120}
              placeholder="e.g. 2 ukay bundles"
            />
          </Field>
        </div>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          {(
            [
              [
                "in_person",
                "In-person",
                "You hand it over now. Get paid once the buyer enters their code.",
                true,
              ],
              [
                "ship",
                "Ship",
                "You ship it. Get paid after it's delivered.",
                false,
              ],
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

/** One order, with its payout tracker and any fulfillment action the seller owes. */
function OrderCard({
  l,
  config,
}: {
  l: SellerLoanView;
  config: SystemConfig;
}) {
  const { payoutDate, isEstimate } = sellerPayoutInfo(l, config);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={l.status} audience="customer" />
        <span className="font-semibold">{formatPeso(l.ticket_centavos)}</span>
        <span className="text-black/55">
          · {l.tenor_months} months · from {l.buyerName}
        </span>
        <span className="ml-auto text-xs text-black/40">
          {formatDateTime(l.created_at)}
        </span>
      </div>
      {l.memo ? (
        <p className="-mt-2 text-xs text-black/50">For: {l.memo}</p>
      ) : null}

      <PayoutTracker
        status={l.status}
        netCentavos={l.netCentavos}
        feeCentavos={l.feeCentavos}
        merchantFeePct={l.merchant_fee_pct}
        payoutDate={payoutDate}
        payoutIsEstimate={isEstimate}
      />

      {l.status === "escrow_held" && l.handoverPending ? (
        <div className="space-y-2.5 border-t border-black/5 pt-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <p className="font-medium">Hand over in person</p>
            <p className="mt-0.5 text-xs text-amber-700/90">
              Your payment is being kept safe by Datung. Give the item to{" "}
              <strong>{l.buyerName}</strong>, then ask them to read the 6-digit
              code on their Datung screen and type it here to release.
              Don&apos;t enter a code before handing the item over.
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
        <div className="space-y-2 border-t border-black/5 pt-3">
          <p className="text-sm text-black/65">
            Payment kept safe. Ship the order, then upload proof to start the
            payout clock.
          </p>
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

      <Link
        href={`/order/${l.id}`}
        className="block border-t border-black/5 pt-3 text-xs font-medium text-brand-700 underline-offset-4 hover:underline"
      >
        View order details &amp; timeline →
      </Link>
    </Card>
  );
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

  // Orders that need the seller to do something (hand over / ship) come first.
  const actionNeeded = loans.filter((l) => l.status === "escrow_held");
  const rest = loans.filter((l) => l.status !== "escrow_held");

  // The soonest expected payout across in-flight orders, for the hero.
  const nextPayout = loans
    .filter((l) => l.status !== "settled" && l.status !== "refunded")
    .map((l) => ({ l, ...sellerPayoutInfo(l, config) }))
    .filter((x) => x.payoutDate)
    .sort((a, b) => (a.payoutDate! < b.payoutDate! ? -1 : 1))[0];

  return (
    <section className="space-y-8">
      {/* Zone 1 — Get paid */}
      <section className="space-y-4">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white shadow-sm shadow-brand-950/20">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-white/60">
              On the way to you
            </span>
            <span className="text-xs text-white/60">
              {stats.activeOrders} order{stats.activeOrders === 1 ? "" : "s"} in
              progress
            </span>
          </div>
          <div className="mt-1 text-4xl font-bold tabular-nums">
            {formatPeso(stats.pendingPayoutCentavos)}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/70">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" />
              Datung holds the buyer&apos;s payment until the order is delivered.
            </span>
            {nextPayout?.payoutDate ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-medium text-white/90">
                <CalendarClock className="size-3" /> Next payout ~{" "}
                {formatDate(nextPayout.payoutDate)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Primary action */}
        <NewSale />

        {/* Slim numbers */}
        <StatGrid>
          <Stat
            label="Gross sales"
            value={formatPeso(stats.grossSalesCentavos)}
            hint={`${stats.totalOrders} order${stats.totalOrders === 1 ? "" : "s"}`}
            icon={TrendingUp}
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
            icon={Wallet}
          />
        </StatGrid>
      </section>

      {/* Zone 2 — Orders that need the seller to act */}
      {actionNeeded.length > 0 ? (
        <div className="space-y-3">
          <SectionHeading icon={Package}>
            Needs your action ({actionNeeded.length})
          </SectionHeading>
          {actionNeeded.map((l) => (
            <OrderCard key={l.id} l={l} config={config} />
          ))}
        </div>
      ) : null}

      {/* Orders */}
      <div className="space-y-3">
        <SectionHeading icon={Package}>
          {actionNeeded.length > 0 ? "Other orders" : "Your orders"} ({rest.length})
        </SectionHeading>

        {loans.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-500">
              <Package className="size-6" />
            </span>
            <p className="text-sm font-medium text-foreground">No orders yet</p>
            <p className="max-w-xs text-xs text-black/50">
              Create a sale above and share the QR or link. Orders buyers pay for
              will show up here, each with its payout tracker.
            </p>
          </Card>
        ) : rest.length === 0 ? (
          <Card className="text-center text-sm text-black/55">
            Nothing else right now — your open orders are up top.
          </Card>
        ) : (
          rest.map((l) => <OrderCard key={l.id} l={l} config={config} />)
        )}
      </div>

      {/* Payout statement */}
      {(() => {
        const paidOut = loans.filter((l) => l.status === "settled");
        if (paidOut.length === 0) return null;
        return (
          <div className="space-y-3">
            <SectionHeading icon={Banknote}>Payout statement</SectionHeading>
            <Card className="divide-y divide-black/5 p-0">
              <div className="flex items-center justify-between px-4 py-2.5 text-xs font-medium text-black/50">
                <span>{paidOut.length} paid-out order(s)</span>
                <span className="tabular-nums">
                  Total {formatPeso(stats.paidOutCentavos)}
                </span>
              </div>
              {paidOut.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-semibold tabular-nums">
                      {formatPeso(l.netCentavos)}
                    </div>
                    <div className="truncate text-xs text-black/50">
                      {l.buyerName}
                      {l.memo ? ` · ${l.memo}` : ""} ·{" "}
                      {formatDate(l.settledAt ?? l.releasedAt ?? l.created_at)}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-black/40">
                    net of {l.merchant_fee_pct}% fee
                  </span>
                </div>
              ))}
              <p className="px-4 py-2 text-[11px] text-black/40">
                To save a statement, use your browser&apos;s Print → Save as PDF.
              </p>
            </Card>
          </div>
        );
      })()}

      {/* Zone 3 — Grow your shop */}
      <div className="space-y-3">
        <SectionHeading icon={Megaphone}>Grow your shop</SectionHeading>
        <MarketingKit sellerUserId={userId} />
        <ReferSellers sellerUserId={userId} />
      </div>

      {/* Zone 4 — Profile / account */}
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
          Your trust tier and selling limit are set by Datung and rise as you
          complete clean orders.
        </p>
        <PasskeySetup />
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
