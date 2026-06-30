import { Suspense } from "react";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { resolveMode } from "@/lib/dashboard/mode";
import BuyerPanel from "@/app/(public)/dashboard/BuyerPanel";
import SellerPanel from "@/app/(public)/dashboard/SellerPanel";
import CapabilityStatus from "@/app/(public)/dashboard/CapabilityStatus";
import { CardSkeleton } from "@/components/brand/Skeleton";

export const dynamic = "force-dynamic";

/** Orders tab — purchases (buyer) or sales (seller) for the active mode. */
export default async function OrdersPage() {
  const caps = await getCapabilities();
  if (!caps) return null;
  const mode = await resolveMode(caps);
  const verified =
    mode === "seller" ? caps.seller === "verified" : caps.buyer === "verified";
  if (!verified) return <CapabilityStatus buyer={caps.buyer} seller={caps.seller} />;

  return (
    <Suspense fallback={<CardSkeleton />}>
      {mode === "seller" ? (
        <SellerPanel userId={caps.userId} email={caps.email} tab="orders" />
      ) : (
        <BuyerPanel userId={caps.userId} email={caps.email} tab="orders" />
      )}
    </Suspense>
  );
}
