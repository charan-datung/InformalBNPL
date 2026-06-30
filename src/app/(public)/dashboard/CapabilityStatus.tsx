import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import type { CapabilityStatus as CapStatus } from "@/lib/profiles/capabilities";
import Callout from "@/components/ui/Callout";

/**
 * Per-capability status rows (active / under review / not approved / add). Lives
 * on the Profile (buyer) and More (seller) tabs so the home stays focused.
 */
export default function CapabilityStatus({
  buyer,
  seller,
}: {
  buyer: CapStatus;
  seller: CapStatus;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-black/50">Your capabilities</h2>
      <CapabilityRow label="Buyer" status={buyer} applyHref="/onboarding/buyer" />
      <CapabilityRow label="Seller" status={seller} applyHref="/onboarding/seller" />
    </section>
  );
}

function CapabilityRow({
  label,
  status,
  applyHref,
}: {
  label: string;
  status: CapStatus;
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
        We&apos;re reviewing your {label.toLowerCase()} application, and this page
        updates automatically as soon as you&apos;re approved.
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
