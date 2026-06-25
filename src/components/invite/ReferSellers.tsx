import QRCode from "qrcode";
import { Users, Gift } from "lucide-react";
import CopyButton from "@/app/(public)/charge/[id]/CopyButton";
import { getRequestOrigin } from "@/lib/http/origin";
import { getConfigValue } from "@/lib/config/system-config";
import { getSellerReferralSummary } from "@/lib/referrals/seller-referrals";
import { formatPeso } from "@/lib/format";

/**
 * "Refer a seller" panel on the seller dashboard. The seller shares a tagged
 * link (/signup?intent=seller&sref=<them>); when a referred seller books their
 * first order, the seller earns a cash bounty the operator settles. Shows the
 * link + QR and a running tally of referrals and earnings.
 */
export default async function ReferSellers({
  sellerUserId,
}: {
  sellerUserId: string;
}) {
  const [origin, reward, summary] = await Promise.all([
    getRequestOrigin(),
    getConfigValue("seller_referral_reward_centavos"),
    getSellerReferralSummary(sellerUserId),
  ]);

  const referUrl = `${origin}/signup?intent=seller&sref=${sellerUserId}`;
  const qrSvg = await QRCode.toString(referUrl, {
    type: "svg",
    margin: 1,
    color: { dark: "#0e4d45", light: "#ffffff" },
  });

  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold text-brand-800">
        <Users className="size-4.5" /> Refer other sellers
      </h2>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-black/55">
        <Gift className="size-3.5 text-accent-600" />
        Earn {formatPeso(reward)} when a seller you refer books their first
        order.
      </p>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
        <div
          className="size-28 shrink-0 rounded-lg border border-black/10 bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="w-full space-y-1">
          <span className="text-xs font-medium text-black/55">
            Your seller referral link
          </span>
          <CopyButton text={referUrl} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Referred" value={String(summary.total)} />
        <Stat label="Owed to you" value={formatPeso(summary.owedCentavos)} accent />
        <Stat label="Paid out" value={formatPeso(summary.paidCentavos)} />
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-black/[0.015] p-2.5">
      <div
        className={`text-base font-bold tabular-nums ${accent ? "text-accent-700" : "text-foreground"}`}
      >
        {value}
      </div>
      <div className="text-[11px] text-black/50">{label}</div>
    </div>
  );
}
