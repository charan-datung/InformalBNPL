import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import SellerApplicationForm from "@/app/(public)/onboarding/seller/SellerApplicationForm";

// Session-dependent: must run per request, never statically cached.
export const dynamic = "force-dynamic";

/**
 * Seller verification for the informal market. We don't require business
 * documents; instead an operator verifies a real person + a real selling
 * presence from three signals: a government ID, a storefront/stall photo and
 * location, and social/marketplace proof. Everything is stored in a private
 * bucket and reviewed by hand.
 */
export default async function SellerOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");
  if (caps.seller !== "none") redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Seller verification</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          No business permits needed. We verify real sellers by hand — just show
          us who you are and where you sell.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <SellerApplicationForm />
    </div>
  );
}
