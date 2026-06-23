import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import BuyerApplicationForm from "@/app/(public)/onboarding/buyer/BuyerApplicationForm";

// Session-dependent: must run per request, never statically cached.
export const dynamic = "force-dynamic";

/**
 * Stage 3 (buyer) — buyer application. Comprehensive, alternative-data
 * underwriting tailored to informal merchants (with an adaptive personal
 * branch). The operator decides manually afterwards. `next=seller` continues
 * the "Both" flow into seller verification.
 */
export default async function BuyerOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");
  if (caps.buyer !== "none") redirect("/dashboard");

  const { error, next } = await searchParams;
  const isBoth = next === "seller";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        {isBoth ? (
          <p className="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
            Step 1 of 2 · Buyer
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold">Buyer application</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          We review every application by hand — there&apos;s no instant decision.
          No business papers needed; tell us how you sell and source so we can
          underwrite you fairly.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <BuyerApplicationForm next={next} />
    </div>
  );
}
