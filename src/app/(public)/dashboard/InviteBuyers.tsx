import { headers } from "next/headers";
import QRCode from "qrcode";
import CopyButton from "@/app/(public)/charge/[id]/CopyButton";

/**
 * Seller's "invite buyers" card. Buyers don't find Datung on their own — the
 * seller hands them a sign-up link or shows the QR at their stall. The link
 * carries ?ref=<sellerUserId> so the buyer's account records who referred them.
 * Server-rendered (absolute URL from request headers + SVG QR), mirroring the
 * Datung Pay charge page.
 */
export default async function InviteBuyers({
  sellerUserId,
}: {
  sellerUserId: string;
}) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const inviteUrl = `${proto}://${host}/signup?ref=${sellerUserId}`;

  const qrSvg = await QRCode.toString(inviteUrl, {
    type: "svg",
    margin: 1,
    color: { dark: "#0e4d45", light: "#ffffff" },
  });

  return (
    <div className="rounded-xl border border-brand-100 bg-white p-4 dark:border-white/10 dark:bg-transparent">
      <h2 className="font-semibold text-brand-800 dark:text-brand-100">
        Invite buyers
      </h2>
      <p className="mt-0.5 text-xs text-black/55 dark:text-white/55">
        Share this so your customers can sign up for Datung credit. Show the QR
        at your stall, or send the link over Messenger/SMS.
      </p>
      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
        <div
          className="h-40 w-40 shrink-0 rounded-lg border border-black/10 bg-white p-2 dark:border-white/10 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="w-full space-y-1">
          <span className="text-xs font-medium text-black/55 dark:text-white/55">
            Your sign-up link
          </span>
          <CopyButton text={inviteUrl} />
        </div>
      </div>
    </div>
  );
}
