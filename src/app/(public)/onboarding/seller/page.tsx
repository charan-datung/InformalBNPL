import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { applyAsSeller } from "@/app/(public)/onboarding/actions";
import PinLocation from "@/app/(public)/onboarding/seller/PinLocation";

// Session-dependent: must run per request, never statically cached.
export const dynamic = "force-dynamic";

const INPUT =
  "w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent";
const FILE =
  "w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-white dark:file:text-slate-900";

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

      <form action={applyAsSeller} encType="multipart/form-data" className="space-y-5">
        {/* Who you are */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-black/45 dark:text-white/45">
            Who you are
          </legend>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Full name</span>
            <input type="text" name="name" required className={INPUT} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Contact (phone or email)</span>
            <input type="text" name="contact" required className={INPUT} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Government ID type</span>
            <select name="id_type" required defaultValue="" className={INPUT}>
              <option value="" disabled>
                Select an ID…
              </option>
              <option value="philsys">PhilSys / National ID</option>
              <option value="drivers_license">Driver&apos;s license</option>
              <option value="passport">Passport</option>
              <option value="umid">UMID</option>
              <option value="postal_id">Postal ID</option>
              <option value="other">Other government ID</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Photo of your government ID</span>
            <input
              type="file"
              name="id_document"
              accept="image/*"
              capture="environment"
              required
              className={FILE}
            />
            <span className="block text-xs text-black/40 dark:text-white/40">
              Held by you, photographed clearly. Stored privately for review only.
            </span>
          </label>
        </fieldset>

        {/* Where you sell */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-black/45 dark:text-white/45">
            Where you sell
          </legend>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Social / marketplace handle(s)</span>
            <input
              type="text"
              name="social_handle"
              required
              placeholder="@yourshop, fb.com/yourshop"
              className={INPUT}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Marketplace link{" "}
                <span className="text-black/40 dark:text-white/40">(optional)</span>
              </span>
              <input
                type="text"
                name="marketplace_url"
                placeholder="Shopee/Lazada/FB page"
                className={INPUT}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Selling since{" "}
                <span className="text-black/40 dark:text-white/40">(optional)</span>
              </span>
              <input type="text" name="selling_since" placeholder="e.g. 2021" className={INPUT} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Storefront / stall photo</span>
            <input
              type="file"
              name="storefront_photo"
              accept="image/*"
              capture="environment"
              required
              className={FILE}
            />
            <span className="block text-xs text-black/40 dark:text-white/40">
              Your stall, shelf, or where you pack orders. Required.
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Where is it? (address / area)</span>
            <input
              type="text"
              name="storefront_location"
              required
              placeholder="e.g. Stall 14, Bankerohan Public Market, Davao"
              className={INPUT}
            />
          </label>
          <PinLocation />
        </fieldset>

        {/* Proof you sell */}
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-black/45 dark:text-white/45">
            Proof you sell
          </legend>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Live item photo</span>
            <input
              type="file"
              name="photo"
              accept="image/*"
              capture="environment"
              required
              className={FILE}
            />
            <span className="block text-xs text-black/40 dark:text-white/40">
              A photo of something you&apos;re selling now. On a phone this opens the camera.
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              Notes <span className="text-black/40 dark:text-white/40">(optional)</span>
            </span>
            <textarea name="notes" rows={2} className={INPUT} />
          </label>
        </fieldset>

        <button
          type="submit"
          className="w-full rounded-md bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Submit for verification
        </button>
      </form>
    </div>
  );
}
