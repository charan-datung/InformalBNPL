import Link from "next/link";
import { Printer } from "lucide-react";
import BuyerInviteCard from "@/components/invite/BuyerInviteCard";
import ShareMessages from "@/components/invite/ShareMessages";
import ShareButton from "@/components/invite/ShareButton";
import Card from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/Button";
import { getRequestOrigin } from "@/lib/http/origin";

/**
 * Everything a verified seller needs to recruit their own buyers: their
 * attributed in-app invite (QR + link), ready-to-send share messages, and a
 * link to a printable stall poster. All three share one inviteUrl so the
 * attribution ?ref stays consistent across surfaces.
 */
export default async function MarketingKit({
  sellerUserId,
  sellerName,
}: {
  sellerUserId: string;
  sellerName?: string;
}) {
  const origin = await getRequestOrigin();
  const inviteUrl = `${origin}/signup?ref=${sellerUserId}`;

  const shareMessage =
    "Shop now, pay over time with me on Datung! 🛍️ No credit card, libreng sign-up. Get approved and buy hulugan:";

  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-semibold text-brand-800">Get customers</h2>
        <ol className="space-y-0.5 text-xs text-black/60">
          <li>1. Share your link or QR (one tap below).</li>
          <li>2. They sign up and get approved — free.</li>
          <li>3. They buy from you and pay over time. Every sign-up is yours.</li>
        </ol>
      </div>

      {/* Idiot-proof: one tap opens the phone's share sheet (Messenger/SMS/etc.) */}
      <ShareButton url={inviteUrl} message={shareMessage} label="Share with buyers" />

      <BuyerInviteCard origin={origin} sellerUserId={sellerUserId} />

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-black/55">
          Or send a ready-made message:
        </p>
        <ShareMessages inviteUrl={inviteUrl} sellerName={sellerName} />
      </div>

      <Link
        href="/dashboard/poster"
        target="_blank"
        className={buttonClasses({ variant: "secondary", className: "w-full" })}
      >
        <Printer className="size-4" />
        Print a stall poster
      </Link>
    </Card>
  );
}
