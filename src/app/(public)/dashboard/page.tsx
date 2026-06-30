import { Suspense } from "react";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { resolveMode } from "@/lib/dashboard/mode";
import BuyerPanel from "@/app/(public)/dashboard/BuyerPanel";
import SellerPanel from "@/app/(public)/dashboard/SellerPanel";
import CapabilityStatus from "@/app/(public)/dashboard/CapabilityStatus";
import { CardSkeleton } from "@/components/brand/Skeleton";
import Callout from "@/components/ui/Callout";

// Session-dependent: must run per request, never statically cached.
export const dynamic = "force-dynamic";

/** Home tab — the core action (buy / sell) for the active mode. */
export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const caps = await getCapabilities();
  if (!caps) return null; // layout already handled the redirect
  const mode = await resolveMode(caps);
  const { error, ok } = await searchParams;
  const verified =
    mode === "seller" ? caps.seller === "verified" : caps.buyer === "verified";

  return (
    <div className="space-y-6">
      {error ? <Callout tone="error">{error}</Callout> : null}
      {ok ? <Callout tone="success">{ok}</Callout> : null}

      {verified ? (
        <Suspense fallback={<CardSkeleton />}>
          {mode === "seller" ? (
            <SellerPanel userId={caps.userId} email={caps.email} tab="home" />
          ) : (
            <BuyerPanel userId={caps.userId} email={caps.email} tab="home" />
          )}
        </Suspense>
      ) : (
        <CapabilityStatus buyer={caps.buyer} seller={caps.seller} />
      )}
    </div>
  );
}
