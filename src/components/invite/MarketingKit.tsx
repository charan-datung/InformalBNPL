import Link from "next/link";
import { Printer } from "lucide-react";
import BuyerInviteCard from "@/components/invite/BuyerInviteCard";
import ShareMessages from "@/components/invite/ShareMessages";
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

  return (
    <Card className="space-y-4">
      <div className="space-y-0.5">
        <h2 className="font-semibold text-brand-800">Marketing kit</h2>
        <p className="text-xs text-black/55">
          Invite your customers to shop now, pay later — every sign-up is
          credited to you.
        </p>
      </div>

      <BuyerInviteCard origin={origin} sellerUserId={sellerUserId} />

      <ShareMessages inviteUrl={inviteUrl} sellerName={sellerName} />

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
