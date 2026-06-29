import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck, CheckCircle2 } from "lucide-react";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { getSellerOrder } from "@/lib/loans/views";
import { getConfig } from "@/lib/config/system-config";
import { sellerPayoutInfo } from "@/lib/loans/payout";
import {
  confirmHandoverAction,
  markShippedAction,
} from "@/app/(public)/dashboard/actions";
import PhotoActionForm from "@/app/(public)/dashboard/PhotoActionForm";
import SellerOrderTimeline from "@/app/(public)/dashboard/SellerOrderTimeline";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDateTime } from "@/lib/format";
import Card from "@/components/ui/Card";
import Callout from "@/components/ui/Callout";
import { Field, TextInput } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

/**
 * Seller's per-order overview — the post-transaction "receipt + status" screen.
 * Confirms payment was secured, what was sold, the money breakdown, a dated
 * timeline of every milestone, and the one action (if any) still owed.
 */
export default async function SellerOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");
  if (caps.seller !== "verified") redirect("/dashboard");

  const { id } = await params;
  const { ok, error } = await searchParams;
  const order = await getSellerOrder(caps.userId, id);
  if (!order) notFound();

  const config = await getConfig();
  const { payoutDate, isEstimate } = sellerPayoutInfo(order, config);
  const paid = Boolean(order.paidAt);
  const here = `/order/${order.id}`;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-black/50 transition-colors hover:text-black/70"
      >
        <ArrowLeft className="size-4" /> Your orders
      </Link>

      {ok ? <Callout tone="success">{ok}</Callout> : null}
      {error ? <Callout tone="error">{error}</Callout> : null}

      {/* Header / receipt */}
      <Card className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-black/45">
              Order from {order.buyerName}
            </div>
            <div className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">
              {formatPeso(order.ticket_centavos)}
            </div>
            {order.memo ? (
              <div className="mt-0.5 text-sm text-black/55">{order.memo}</div>
            ) : null}
          </div>
          <StatusBadge status={order.status} audience="customer" />
        </div>

        {/* Payment-secured confirmation — the reassurance moment */}
        {paid ? (
          <div className="flex items-start gap-2 rounded-xl border border-accent-200 bg-accent-50/60 px-3 py-2.5 text-sm text-accent-800">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>
              Payment secured — Datung is holding{" "}
              {formatPeso(order.ticket_centavos)} for you since{" "}
              {formatDateTime(order.paidAt!)}.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2.5 text-sm text-black/60">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>Waiting for the buyer to pay this request.</span>
          </div>
        )}

        {/* Money breakdown */}
        <dl className="divide-y divide-black/5 rounded-xl border border-black/[0.07] text-sm">
          <Row k="Sale amount" v={formatPeso(order.ticket_centavos)} />
          <Row
            k={`Datung fee (${order.merchant_fee_pct}%)`}
            v={`− ${formatPeso(order.feeCentavos)}`}
            muted
          />
          <Row k="Net to you" v={formatPeso(order.netCentavos)} strong />
        </dl>
        <p className="text-xs text-black/45">
          {order.settledAt
            ? `Paid out on ${formatDateTime(order.settledAt)}.`
            : payoutDate
              ? `${isEstimate ? "Estimated" : "Committed"} payout around ${formatDateTime(payoutDate)}.`
              : "Payout scheduled after the order is delivered."}
        </p>
      </Card>

      {/* Timeline */}
      <Card className="space-y-3 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-foreground">Order timeline</h2>
        <SellerOrderTimeline order={order} payoutDate={payoutDate} />
      </Card>

      {/* Action still owed by the seller */}
      {order.status === "escrow_held" && order.handoverPending ? (
        <Card className="space-y-3 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-foreground">
            Confirm the hand-over
          </h2>
          <p className="text-xs text-black/55">
            Give the item to <strong>{order.buyerName}</strong>, then ask them to
            read the 6-digit code on their Datung screen and enter it here.
            Don&apos;t enter a code before handing the item over — it&apos;s your
            proof the hand-over happened.
          </p>
          <form
            action={confirmHandoverAction}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="loanId" value={order.id} />
            <input type="hidden" name="redirectTo" value={here} />
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
        </Card>
      ) : order.status === "escrow_held" ? (
        <Card className="space-y-3 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-foreground">Ship the order</h2>
          <p className="text-xs text-black/55">
            Send the order, then upload a photo of the parcel or hand-off to start
            the payout clock.
          </p>
          <PhotoActionForm
            action={markShippedAction}
            loanId={order.id}
            fileName="proof"
            fileLabel="Proof of shipment (required)"
            fileHint="A photo of the parcel or hand-off. On a phone this opens the camera."
            submitLabel="Mark as shipped"
            pendingLabel="Submitting…"
            redirectTo={here}
          />
        </Card>
      ) : null}
    </div>
  );
}

function Row({
  k,
  v,
  muted,
  strong,
}: {
  k: string;
  v: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <dt className={muted ? "text-black/45" : "text-black/60"}>{k}</dt>
      <dd
        className={`tabular-nums ${strong ? "text-base font-bold text-foreground" : muted ? "text-black/45" : "font-medium"}`}
      >
        {v}
      </dd>
    </div>
  );
}
