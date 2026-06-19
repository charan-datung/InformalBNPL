import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { applyAsBuyer } from "@/app/(public)/onboarding/actions";

// Session-dependent: must run per request, never statically cached.
export const dynamic = "force-dynamic";

/**
 * Stage 3 (buyer) — buyer application. This is where underwriting input is
 * collected; the operator decides manually afterwards. `next=seller` continues
 * the "Both" flow into seller verification.
 */
export default async function BuyerOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");
  // Already applied as a buyer — nothing to do here.
  if (caps.buyer !== "none") redirect("/dashboard");

  const { error, next } = await searchParams;
  const isBoth = next === "seller";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        {isBoth ? (
          <p className="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
            Step 1 of 2 · Buyer
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold">Buyer application</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          We review every application by hand — there&apos;s no instant
          decision. Tell us a bit about yourself.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <form action={applyAsBuyer} className="space-y-4">
        {isBoth ? <input type="hidden" name="next" value="seller" /> : null}

        <label className="block space-y-1">
          <span className="text-sm font-medium">Full name</span>
          <input
            type="text"
            name="name"
            required
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Contact (phone or email)</span>
          <input
            type="text"
            name="contact"
            required
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Monthly income (PHP){" "}
            <span className="text-black/40 dark:text-white/40">(optional)</span>
          </span>
          <input
            type="text"
            name="monthly_income"
            inputMode="numeric"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Anything else we should know?{" "}
            <span className="text-black/40 dark:text-white/40">(optional)</span>
          </span>
          <textarea
            name="details"
            rows={3}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
        >
          {isBoth ? "Submit & continue to seller" : "Submit application"}
        </button>
      </form>
    </div>
  );
}
