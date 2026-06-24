"use client";

import { applyAsSeller } from "@/app/(public)/onboarding/actions";
import PinLocation from "@/app/(public)/onboarding/seller/PinLocation";
import PhLocation from "@/app/(public)/onboarding/PhLocation";
import SubmitButton from "@/app/(public)/onboarding/SubmitButton";
import { compressInputFiles } from "@/lib/images/compress";

const INPUT =
  "w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent";
const FILE =
  "w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white dark:file:bg-white dark:file:text-slate-900";

/**
 * Details carried over from the buyer step in the "Both" flow so the same
 * person isn't asked twice. All fields stay editable (e.g. storefront city may
 * differ from home), and the ID photo is reused server-side when not re-added.
 */
export type SellerPrefill = {
  name?: string;
  contact?: string;
  idType?: string;
  city?: string;
  province?: string;
  hasBuyerId: boolean;
};

/**
 * Seller verification form for the informal market — three signals, no business
 * documents: a government ID, a storefront/stall photo + location, and
 * social/marketplace proof.
 */
export default function SellerApplicationForm({
  prefill,
}: {
  prefill?: SellerPrefill | null;
}) {
  return (
    <form action={applyAsSeller} encType="multipart/form-data" className="space-y-5">
      {/* Who you are */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-black/45 dark:text-white/45">
          Who you are
        </legend>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Full name</span>
          <input
            type="text"
            name="name"
            required
            defaultValue={prefill?.name ?? ""}
            className={INPUT}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Contact (phone or email)</span>
          <input
            type="text"
            name="contact"
            required
            defaultValue={prefill?.contact ?? "+639"}
            className={INPUT}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Government ID type</span>
          <select
            name="id_type"
            required
            defaultValue={prefill?.idType ?? ""}
            className={INPUT}
          >
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
          <span className="text-sm font-medium">
            Photo of your government ID
            {prefill?.hasBuyerId ? (
              <span className="text-black/40 dark:text-white/40"> (optional)</span>
            ) : null}
          </span>
          <input
            type="file"
            name="id_document"
            accept="image/*"
            capture="environment"
            required={!prefill?.hasBuyerId}
            onChange={(e) => void compressInputFiles(e.currentTarget)}
            className={FILE}
          />
          <span className="block text-xs text-black/40 dark:text-white/40">
            {prefill?.hasBuyerId
              ? "We'll reuse the ID you uploaded as a buyer — only add a photo if it's a different ID."
              : "Held by you, photographed clearly. Stored privately for review only."}
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
            onChange={(e) => void compressInputFiles(e.currentTarget)}
            className={FILE}
          />
          <span className="block text-xs text-black/40 dark:text-white/40">
            Your stall, shelf, or where you pack orders. Required.
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Address / area</span>
          <input
            type="text"
            name="storefront_location"
            required
            placeholder="e.g. Stall 14, Bankerohan Public Market"
            className={INPUT}
          />
        </label>
        <PhLocation
          inputClassName={INPUT}
          required
          provinceName="storefront_province"
          cityName="storefront_city"
          defaultProvince={prefill?.province}
          defaultCity={prefill?.city}
        />
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
            onChange={(e) => void compressInputFiles(e.currentTarget)}
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

      <SubmitButton
        pendingText="Submitting for verification…"
        className="w-full rounded-md bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
      >
        Submit for verification
      </SubmitButton>
    </form>
  );
}
