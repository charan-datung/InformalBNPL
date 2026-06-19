import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { applyAsSeller } from "@/app/(public)/onboarding/actions";

/**
 * Stage 3 (seller) — seller verification. Requires a live item photo, captured
 * with the device camera on mobile (capture="environment"). The photo is stored
 * in a private bucket; an operator verifies it manually.
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
          We verify sellers by hand. Take a live photo of an item you intend to
          sell — this helps confirm you&apos;re a real seller.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <form
        action={applyAsSeller}
        encType="multipart/form-data"
        className="space-y-4"
      >
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
            Social handle(s) — where you sell
          </span>
          <input
            type="text"
            name="social_handle"
            required
            placeholder="@yourshop, fb.com/yourshop"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Live item photo</span>
          <input
            type="file"
            name="photo"
            accept="image/*"
            capture="environment"
            required
            className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-white dark:file:text-slate-900"
          />
          <span className="block text-xs text-black/40 dark:text-white/40">
            On a phone this opens the camera. Required.
          </span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Notes{" "}
            <span className="text-black/40 dark:text-white/40">(optional)</span>
          </span>
          <textarea
            name="notes"
            rows={3}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
        >
          Submit for verification
        </button>
      </form>
    </div>
  );
}
