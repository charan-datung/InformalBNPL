import { qrSvg as makeQrSvg } from "@/lib/qr";
import CopyButton from "@/app/(public)/charge/[id]/CopyButton";

/**
 * Shareable buyer sign-up invite: a scannable QR + copyable link that carries
 * ?ref=<sellerUserId> for attribution. Server-rendered. Used both on the
 * seller's own dashboard and in the operator console (per approved seller), so
 * the two surfaces always produce identical links.
 */
export default async function BuyerInviteCard({
  origin,
  sellerUserId,
  label,
  qrSize = 160,
}: {
  origin: string;
  sellerUserId: string;
  label?: string;
  qrSize?: number;
}) {
  const inviteUrl = `${origin}/signup?ref=${sellerUserId}`;
  const qrSvg = await makeQrSvg(inviteUrl);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-transparent">
      {label ? (
        <div className="mb-2 truncate text-sm font-medium" title={label}>
          {label}
        </div>
      ) : null}
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div
          style={{ width: qrSize, height: qrSize }}
          className="shrink-0 rounded-lg border border-black/10 bg-white p-2 dark:border-white/10 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="w-full space-y-1">
          <span className="text-xs font-medium text-black/55 dark:text-white/55">
            Sign-up link
          </span>
          <CopyButton text={inviteUrl} />
        </div>
      </div>
    </div>
  );
}
