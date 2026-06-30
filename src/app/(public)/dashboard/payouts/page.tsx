import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { resolveMode } from "@/lib/dashboard/mode";
import SellerPanel from "@/app/(public)/dashboard/SellerPanel";
import { CardSkeleton } from "@/components/brand/Skeleton";

export const dynamic = "force-dynamic";

/** Payouts tab (seller) — pending payout summary + statement. */
export default async function PayoutsPage() {
  const caps = await getCapabilities();
  if (!caps) return null;
  const mode = await resolveMode(caps);
  if (mode !== "seller" || caps.seller !== "verified") redirect("/dashboard");

  return (
    <Suspense fallback={<CardSkeleton />}>
      <SellerPanel userId={caps.userId} email={caps.email} tab="payouts" />
    </Suspense>
  );
}
