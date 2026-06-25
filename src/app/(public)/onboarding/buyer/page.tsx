import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import BuyerApplicationForm from "@/app/(public)/onboarding/buyer/BuyerApplicationForm";
import Card from "@/components/ui/Card";
import Callout from "@/components/ui/Callout";

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
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-1.5">
        {isBoth ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            Step 1 of 2 · Buyer
          </p>
        ) : null}
        <h1 className="text-3xl font-bold tracking-tight">Buyer application</h1>
        <p className="text-sm text-black/55">
          No business papers needed — just tell us how you earn so we can review
          you fairly.
        </p>
      </div>

      {error ? <Callout tone="error">{error}</Callout> : null}

      <Card className="p-5 sm:p-6">
        <BuyerApplicationForm next={next} />
      </Card>
    </div>
  );
}
