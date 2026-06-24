import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCapabilities,
  hasNoCapability,
  type CapabilityStatus,
} from "@/lib/profiles/capabilities";
import DashboardModes from "@/app/(public)/dashboard/DashboardModes";
import BuyerPanel from "@/app/(public)/dashboard/BuyerPanel";
import SellerPanel from "@/app/(public)/dashboard/SellerPanel";
import { CardSkeleton } from "@/components/brand/Skeleton";

// Session-dependent: must run per request, never statically cached.
export const dynamic = "force-dynamic";

/**
 * Stage 4 — active dashboard. Routing rules:
 *   - not logged in        -> /login
 *   - no capability at all  -> /onboarding (Stage 2)
 *   - otherwise             -> show approved panels + status of the rest
 *
 * Each capability is shown independently with its own approval status, and any
 * capability the user hasn't applied for surfaces an obvious "add it" path.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");
  // Staff run the back office, not the buyer/seller dashboard.
  if (caps.staffRole) redirect("/operator");
  if (hasNoCapability(caps)) redirect("/onboarding");

  const { error } = await searchParams;
  const buyerVerified = caps.buyer === "verified";
  const sellerVerified = caps.seller === "verified";
  const bothVerified = buyerVerified && sellerVerified;

  // Wrapped in Suspense so the dashboard shell (header, capabilities) streams
  // immediately while each panel's data loads behind a skeleton — the page
  // never blocks on the slowest query before showing anything.
  const buyerNode = buyerVerified ? (
    <Suspense fallback={<CardSkeleton />}>
      <BuyerPanel userId={caps.userId} />
    </Suspense>
  ) : null;
  const sellerNode = sellerVerified ? (
    <Suspense fallback={<CardSkeleton />}>
      <SellerPanel userId={caps.userId} />
    </Suspense>
  ) : null;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Your dashboard</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{caps.email}</p>
      </header>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* Active area: a mode toggle when both are approved, else the one panel. */}
      {bothVerified ? (
        <DashboardModes buyer={buyerNode} seller={sellerNode} />
      ) : (
        <div className="space-y-4">
          {buyerNode}
          {sellerNode}
        </div>
      )}

      {/* Capability status: pending / rejected notices and "add capability". */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Your capabilities
        </h2>
        <CapabilityRow
          label="Buyer"
          status={caps.buyer}
          applyHref="/onboarding/buyer"
        />
        <CapabilityRow
          label="Seller"
          status={caps.seller}
          applyHref="/onboarding/seller"
        />
      </section>
    </div>
  );
}

function CapabilityRow({
  label,
  status,
  applyHref,
}: {
  label: string;
  status: CapabilityStatus;
  applyHref: string;
}) {
  if (status === "verified") {
    return (
      <div className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-3 text-sm dark:border-white/10">
        <span className="font-medium">{label}</span>
        <span className="text-green-600">Active</span>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <div className="flex items-center justify-between">
          <span className="font-medium">{label}</span>
          <span className="text-amber-700 dark:text-amber-400">Under review</span>
        </div>
        <p className="mt-1 text-black/60 dark:text-white/60">
          Your {label.toLowerCase()} application is being reviewed by hand.
          We&apos;ll update this once a decision is made.
        </p>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm dark:border-red-900 dark:bg-red-950/40">
        <div className="flex items-center justify-between">
          <span className="font-medium">{label}</span>
          <span className="text-red-700 dark:text-red-400">Not approved</span>
        </div>
        <Link
          href={applyHref}
          className="mt-1 inline-block underline underline-offset-4"
        >
          Re-apply
        </Link>
      </div>
    );
  }

  // status === "none": the "add the other capability" path.
  return (
    <div className="flex items-center justify-between rounded-lg border border-dashed border-black/20 px-4 py-3 text-sm dark:border-white/20">
      <span className="text-black/60 dark:text-white/60">
        Add {label.toLowerCase()} capability
      </span>
      <Link href={applyHref} className="font-medium underline underline-offset-4">
        {label === "Buyer" ? "Start buying" : "Become a seller"}
      </Link>
    </div>
  );
}
