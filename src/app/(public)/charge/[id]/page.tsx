import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { getChargeById, isExpired } from "@/lib/payments/charges";
import { formatPeso } from "@/lib/format";
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

  const qrSvg = await QRCode.toString(payUrl, {
    type: "svg",
    margin: 1,
    color: { dark: "#0e4d45", light: "#ffffff" },
  });

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Poller active={status === "pending"} />

      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-black/50 underline-offset-4 hover:underline dark:text-white/50">
          ← Dashboard
        </Link>
        <span className="text-xs text-black/40 dark:text-white/40">Datung Pay</span>
      </div>

      <div className="rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-6 text-center dark:border-white/10 dark:from-brand-950 dark:to-brand-900">
        <div className="text-xs uppercase tracking-wide text-black/45 dark:text-white/45">
          Amount to charge
        </div>
        <div className="text-4xl font-bold tabular-nums text-brand-800 dark:text-white">
          {formatPeso(charge.amount_centavos)}
        </div>
        {charge.memo ? (
          <div className="mt-1 text-sm text-black/55 dark:text-white/55">{charge.memo}</div>
        ) : null}
        <div className="mt-1 text-xs text-black/40 dark:text-white/40">
          {charge.fulfillment === "ship" ? "Ship — escrow until delivered" : "In-person — hand over now"}
        </div>
      </div>

      {status === "pending" ? (
        <>
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-56 w-56 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="text-center text-sm text-black/55 dark:text-white/55">
              Ask the buyer to <strong>scan this</strong> with their phone camera.
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-black/55 dark:text-white/55">
              …or send the exclusive link
            </span>
            <CopyButton text={payUrl} />
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            Waiting for the buyer to approve…
          </div>
        </>
      ) : status === "authorized" ? (
        <div className="space-y-3 rounded-2xl border border-accent-200 bg-accent-50 p-6 text-center dark:border-accent-900 dark:bg-accent-900/20">
          <div className="text-5xl">✓</div>
          <div className="text-xl font-semibold text-accent-800 dark:text-accent-200">Approved</div>
          <p className="text-sm text-black/60 dark:text-white/70">
            {formatPeso(charge.amount_centavos)} authorized.{" "}
            {charge.fulfillment === "ship"
              ? "Held in escrow — ship the order and mark it shipped."
              : "You can hand over the goods now."}
          </p>
          <Link href="/dashboard" className="inline-block text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-200">
            Go to your orders
          </Link>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-black/10 p-6 text-center dark:border-white/10">
          <div className="text-sm text-black/60 dark:text-white/60">
            This request {charge.status === "cancelled" ? "was cancelled" : "expired"} before it was paid.
          </div>
          <Link href="/dashboard" className="inline-block text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-200">
            Start a new sale
          </Link>
        </div>
      )}
    </div>
  );
}
