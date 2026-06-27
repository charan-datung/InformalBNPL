import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { qrSvg as makeQrSvg } from "@/lib/qr";
import { ArrowLeft, CheckCircle2, QrCode } from "lucide-react";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { getChargeById, isExpired } from "@/lib/payments/charges";
import { formatPeso } from "@/lib/format";
import Card from "@/components/ui/Card";
import Callout from "@/components/ui/Callout";
import { buttonClasses } from "@/components/ui/Button";
import Poller from "@/app/(public)/charge/[id]/Poller";
import CopyButton from "@/app/(public)/charge/[id]/CopyButton";

export const dynamic = "force-dynamic";

/**
 * Seller's "terminal" view of a Payment Request: a QR to scan and an exclusive
 * link to share, with the amount locked in. The page polls itself so it flips
 * to "Approved" the moment the buyer authorizes.
 */
export default async function ChargePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");

  const { id } = await params;
  const charge = await getChargeById(id);
  if (!charge) redirect("/dashboard?error=" + encodeURIComponent("Payment request not found."));
  if (charge.seller_user_id !== caps.userId) redirect("/dashboard");

  const expired = await isExpired(charge);
  const status = expired && charge.status === "pending" ? "expired" : charge.status;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const payUrl = `${proto}://${host}/pay/${charge.token}`;

  const qrSvg = await makeQrSvg(payUrl);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Poller active={status === "pending"} />

      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-black/50 transition-colors hover:text-black/70"
        >
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
        <span className="text-xs font-medium text-black/40">Datung Pay</span>
      </div>

      <Card className="p-6 text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-black/45">
          Amount to charge
        </div>
        <div className="mt-1 text-4xl font-bold tabular-nums text-brand-800">
          {formatPeso(charge.amount_centavos)}
        </div>
        {charge.memo ? (
          <div className="mt-1.5 text-sm text-black/55">{charge.memo}</div>
        ) : null}
        <div className="mt-1 text-xs text-black/40">
          {charge.fulfillment === "ship" ? "Ship — you get paid after delivery" : "In-person — hand over now"}
        </div>
      </Card>

      {status === "pending" ? (
        <>
          <Card className="space-y-5 p-5 text-center sm:p-6">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-brand-700">
              <QrCode className="size-4" /> Show this to your buyer
            </div>
            <div className="flex justify-center">
              <div
                className="h-56 w-56 rounded-xl bg-white p-3 ring-1 ring-black/[0.06] [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            </div>
            <p className="text-sm text-black/55">
              Ask the buyer to <strong className="font-semibold text-black/70">scan this</strong>{" "}
              with their phone camera.
            </p>

            <div className="space-y-2 border-t border-black/[0.06] pt-5 text-left">
              <span className="text-xs font-medium text-black/55">
                …or send the exclusive link
              </span>
              <CopyButton text={payUrl} />
            </div>
          </Card>

          <Callout tone="info">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block size-2 animate-pulse rounded-full bg-brand-500" />
              Waiting for the buyer to approve…
            </span>
          </Callout>
        </>
      ) : status === "authorized" ? (
        <Card className="space-y-2 p-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-accent-500" />
          <div className="text-xl font-semibold text-accent-800">Approved</div>
          <p className="text-sm text-black/55">
            {formatPeso(charge.amount_centavos)} approved.{" "}
            {charge.fulfillment === "ship"
              ? "Payment kept safe — ship the order and mark it shipped to get paid."
              : "You can hand over the goods now."}
          </p>
          <Link
            href="/dashboard"
            className={buttonClasses({ variant: "primary", size: "md", className: "mt-2 w-full" })}
          >
            Go to your orders
          </Link>
        </Card>
      ) : (
        <Card className="space-y-3 p-6 text-center">
          <p className="text-sm text-black/55">
            This request {charge.status === "cancelled" ? "was cancelled" : "expired"} before it was paid.
          </p>
          <Link
            href="/dashboard"
            className={buttonClasses({ variant: "secondary", size: "md", className: "w-full" })}
          >
            Start a new sale
          </Link>
        </Card>
      )}
    </div>
  );
}
