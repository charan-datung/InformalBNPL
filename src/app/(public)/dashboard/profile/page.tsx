import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { resolveMode } from "@/lib/dashboard/mode";
import BuyerPanel from "@/app/(public)/dashboard/BuyerPanel";
import CapabilityStatus from "@/app/(public)/dashboard/CapabilityStatus";
import { CardSkeleton } from "@/components/brand/Skeleton";

export const dynamic = "force-dynamic";

/** Profile tab (buyer) — account, credit, passkey, support + capabilities. */
export default async function ProfilePage() {
  const caps = await getCapabilities();
  if (!caps) return null;
  const mode = await resolveMode(caps);
  if (mode !== "buyer") redirect("/dashboard");

  return (
    <div className="space-y-6">
      {caps.buyer === "verified" ? (
        <Suspense fallback={<CardSkeleton />}>
          <BuyerPanel userId={caps.userId} email={caps.email} tab="profile" />
        </Suspense>
      ) : null}
      <CapabilityStatus buyer={caps.buyer} seller={caps.seller} />
    </div>
  );
}
