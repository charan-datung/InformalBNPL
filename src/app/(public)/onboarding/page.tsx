import Link from "next/link";
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";

/**
 * Stage 2 — role selection. Neutral screen shown right after signup and
 * whenever a logged-in user still has no capability. Choices are NOT exclusive:
 * "Both" walks through buyer then seller, and either can be added later from the
 * dashboard.
 */
export default async function OnboardingPage() {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");

  // If they already applied for something, the dashboard is the right place.
  if (caps.buyer !== "none" || caps.seller !== "none") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">What would you like to do?</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          You can change or add to this later — it&apos;s not a one-time choice.
        </p>
      </div>

      <div className="grid gap-3">
        <Link
          href="/onboarding/buyer"
          className="rounded-lg border border-black/15 p-4 hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.04]"
        >
          <div className="font-medium">Buy</div>
          <p className="text-sm text-black/60 dark:text-white/60">
            Apply to buy now and pay later. Starts a buyer application.
          </p>
        </Link>

        <Link
          href="/onboarding/seller"
          className="rounded-lg border border-black/15 p-4 hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.04]"
        >
          <div className="font-medium">Sell</div>
          <p className="text-sm text-black/60 dark:text-white/60">
            Offer items to BNPL buyers. Starts seller verification.
          </p>
        </Link>

        <Link
          href="/onboarding/buyer?next=seller"
          className="rounded-lg border border-black/15 p-4 hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.04]"
        >
          <div className="font-medium">Both</div>
          <p className="text-sm text-black/60 dark:text-white/60">
            Do both. We&apos;ll take you through the buyer application, then
            seller verification.
          </p>
        </Link>
      </div>
    </div>
  );
}
