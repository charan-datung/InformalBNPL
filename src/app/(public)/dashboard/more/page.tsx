import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { resolveMode } from "@/lib/dashboard/mode";
import SellerPanel from "@/app/(public)/dashboard/SellerPanel";
import CapabilityStatus from "@/app/(public)/dashboard/CapabilityStatus";
import { CardSkeleton } from "@/components/brand/Skeleton";

export const dynamic = "force-dynamic";

/** More tab (seller) — grow tools, profile, support + capabilities. */
export default async function MorePage() {
  const caps = await getCapabilities();
  if (!caps) return null;
  const mode = await resolveMode(caps);
  if (mode !== "seller") redirect("/dashboard");

  return (
    <div className="space-y-6">
      {caps.seller === "verified" ? (
        <Suspense fallback={<CardSkeleton />}>
          <SellerPanel userId={caps.userId} email={caps.email} tab="more" />
        </Suspense>
      ) : null}
      <CapabilityStatus buyer={caps.buyer} seller={caps.seller} />
    </div>
  );
}
