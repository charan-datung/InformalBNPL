import { getRequestOrigin } from "@/lib/http/origin";
import BuyerInviteCard from "@/components/invite/BuyerInviteCard";

/**
 * Seller's "invite buyers" card on their dashboard. Buyers don't find Datung on
 * their own — the seller hands them the sign-up link or shows the QR at their
 * stall. The link carries ?ref=<sellerUserId> so the buyer's account records who
 * referred them.
 */
export default async function InviteBuyers({
  sellerUserId,
}: {
  sellerUserId: string;
}) {
  const origin = await getRequestOrigin();

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 dark:border-white/10 dark:bg-brand-950/30">
      <h2 className="font-semibold text-brand-800 dark:text-brand-100">
        Invite buyers
      </h2>
      <p className="mb-3 mt-0.5 text-xs text-black/55 dark:text-white/55">
        Share this so your customers can sign up for Datung credit. Show the QR
        at your stall, or send the link over Messenger/SMS.
      </p>
      <BuyerInviteCard origin={origin} sellerUserId={sellerUserId} />
    </div>
  );
}
