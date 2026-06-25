import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCapabilities,
  hasNoCapability,
  type CapabilityStatus,
} from "@/lib/profiles/capabilities";
import { getAccountProfile } from "@/lib/profiles/account";
import DashboardModes from "@/app/(public)/dashboard/DashboardModes";
import BuyerPanel from "@/app/(public)/dashboard/BuyerPanel";
import SellerPanel from "@/app/(public)/dashboard/SellerPanel";
import { CardSkeleton } from "@/components/brand/Skeleton";
import Callout from "@/components/ui/Callout";
import { CheckCircle2, ArrowRight } from "lucide-react";

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
      <BuyerPanel userId={caps.userId} email={caps.email} />
    </Suspense>
  ) : null;
  const sellerNode = sellerVerified ? (
    <Suspense fallback={<CardSkeleton />}>
      <SellerPanel userId={caps.userId} email={caps.email} />
    </Suspense>
  ) : null;

  const account = await getAccountProfile(caps.userId, caps.email);
  const firstName = account.name.trim().split(/\s+/)[0] || null;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">
          {firstName ? `Hi, ${firstName}` : "Your dashboard"}
        </h1>
        <p className="text-sm text-black/55">{caps.email}</p>
      </header>

      {error ? <Callout tone="error">{error}</Callout> : null}

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
        <h2 className="text-sm font-semibold text-black/50">
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
      <div className="flex items-center justify-between rounded-xl border border-black/[0.07] bg-white px-4 py-3 text-sm shadow-sm">
        <span className="font-semibold">{label}</span>
        <span className="inline-flex items-center gap-1.5 font-medium text-accent-700">
          <CheckCircle2 className="size-4" /> Active
        </span>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <Callout tone="warning" title={`${label} · under review`}>
        Your {label.toLowerCase()} application is being reviewed by hand. We&apos;ll
        update this once a decision is made.
      </Callout>
    );
  }

  if (status === "rejected") {
    return (
      <Callout tone="error" title={`${label} · not approved`}>
        <Link href={applyHref} className="font-medium underline underline-offset-4">
          Re-apply
        </Link>
      </Callout>
    );
  }

  // status === "none": the "add the other capability" path.
  return (
    <Link
      href={applyHref}
      className="flex items-center justify-between rounded-xl border border-dashed border-black/20 bg-white/40 px-4 py-3 text-sm transition-colors hover:border-brand-300 hover:bg-brand-50/40"
    >
      <span className="text-black/55">Add {label.toLowerCase()} capability</span>
      <span className="inline-flex items-center gap-1.5 font-semibold text-brand-700">
        {label === "Buyer" ? "Start buying" : "Become a seller"}
        <ArrowRight className="size-4" />
      </span>
    </Link>
  );
}
