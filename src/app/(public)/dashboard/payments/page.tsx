import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { resolveMode } from "@/lib/dashboard/mode";
import BuyerPanel from "@/app/(public)/dashboard/BuyerPanel";
import { CardSkeleton } from "@/components/brand/Skeleton";

export const dynamic = "force-dynamic";

/** Payments tab (buyer) — what's owed, plans, pay, history. */
export default async function PaymentsPage() {
  const caps = await getCapabilities();
  if (!caps) return null;
  const mode = await resolveMode(caps);
  if (mode !== "buyer" || caps.buyer !== "verified") redirect("/dashboard");

  return (
    <Suspense fallback={<CardSkeleton />}>
      <BuyerPanel userId={caps.userId} email={caps.email} tab="payments" />
    </Suspense>
  );
}
