"use client";

import { useState, useRef, useEffect } from "react";
import { applyAsBuyer } from "@/app/(public)/onboarding/actions";
import {
  ID_TYPES,
  SELL_CHANNELS,
  SOURCING,
  RESTOCK_FREQUENCY,
  EMPLOYMENT_STATUS,
  EWALLETS,
  BANKS,
  type BuyerKind,
} from "@/lib/profiles/buyer-application";
import PhLocation from "@/app/(public)/onboarding/PhLocation";
import SubmitButton from "@/app/(public)/onboarding/SubmitButton";
import { compressFormImages } from "@/lib/images/compress";
import { idHint, validateIdNumber } from "@/lib/profiles/id-validation";

const input =
  "w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent";
const label = "block space-y-1";
const labelText = "text-sm font-medium";
const hint = "text-xs text-black/40 dark:text-white/40";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

export default function BuyerApplicationForm({ next }: { next?: string }) {
  const [kind, setKind] = useState<BuyerKind>("business");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [payout, setPayout] = useState<"ewallet" | "bank">("ewallet");

  // Validate the ID number inline (client-side) so a typo shows under the field
  // and blocks submit via native form validation — instead of a server redirect
  // that would wipe everything the applicant has typed.
  const idInputRef = useRef<HTMLInputElement>(null);
  const idError = idType && idNumber ? validateIdNumber(idType, idNumber) : null;
  useEffect(() => {
    idInputRef.current?.setCustomValidity(idError ?? "");
  }, [idError]);

  // Shrink photos in the browser before the server action runs — the upload is
  // the slow part, and useFormStatus keeps the button in its pending state for
  // the whole compress + upload + save cycle.
  async function submit(formData: FormData) {
    await compressFormImages(formData);
    await applyAsBuyer(formData);
  }

  return (
    <form action={submit} encType="multipart/form-data" className="space-y-5">
      {next === "seller" ? <input type="hidden" name="next" value="seller" /> : null}

      {/* Purpose toggle drives the adaptive branch */}
      <Section title="What are you applying for?">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["business", "Buying stock to resell (business)"],
              ["personal", "Personal purchases"],
            ] as [BuyerKind, string][]
          ).map(([value, text]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${
                kind === value
                  ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                  : "border-black/15 dark:border-white/15"
              }`}
            >
              <input
                type="radio"
                name="buyer_kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              {text}
            </label>
          ))}
        </div>
      </Section>

      {/* You */}
      <Section title="You">
        <label className={label}>
          <span className={labelText}>Full name</span>
          <input name="name" required className={input} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            <span className={labelText}>Mobile number</span>
            <input
              name="contact"
              required
              inputMode="tel"
              defaultValue="+639"
              placeholder="+639XX XXX XXXX"
              className={input}
            />
          </label>
          <label className={label}>
            <span className={labelText}>
              Email <span className={hint}>(optional)</span>
            </span>
            <input name="email" type="email" className={input} />
          </label>
          <label className={label}>
            <span className={labelText}>Date of birth</span>
            <input name="date_of_birth" type="date" required className={input} />
          </label>
          <PhLocation inputClassName={input} />
        </div>
      </Section>

      {/* Identity */}
      <Section title="Identity (one valid government ID)">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            <span className={labelText}>ID type</span>
            <select
              name="id_type"
              required
              defaultValue=""
              onChange={(e) => setIdType(e.target.value)}
              className={input}
            >
              <option value="" disabled>
                Choose…
              </option>
              {ID_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            <span className={labelText}>ID number</span>
            <input
              name="id_number"
              ref={idInputRef}
              required
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              aria-invalid={idError ? true : undefined}
              className={input}
            />
            {idError ? (
              <span className="text-xs text-red-600 dark:text-red-400">
                {idError}
              </span>
            ) : idHint(idType) ? (
              <span className={hint}>Format: {idHint(idType)}</span>
            ) : null}
          </label>
        </div>
        <label className={label}>
          <span className={labelText}>Photo of your ID</span>
          <input
            type="file"
            name="id_photo"
            accept="image/*"
            capture="environment"
            required
            className="block text-sm"
          />
          <span className={hint}>
            On a phone this opens the camera. Stored privately for review.
          </span>
        </label>
        <label className={label}>
          <span className={labelText}>
            Proof of billing <span className={hint}>(optional — utility bill, address)</span>
          </span>
          <input
            type="file"
            name="proof_of_billing"
            accept="image/*"
            capture="environment"
            className="block text-sm"
          />
          <span className={hint}>
            A recent bill in your name helps verify your address.
          </span>
        </label>
      </Section>

      {/* Business branch */}
      {kind === "business" ? (
        <>
          <Section title="What you sell">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>
                <span className={labelText}>What do you sell?</span>
                <input
                  name="product_category"
                  required
                  placeholder="e.g. ukay clothes, snacks, phone accessories"
                  className={input}
                />
              </label>
              <label className={label}>
                <span className={labelText}>
                  Months selling <span className={hint}>(optional)</span>
                </span>
                <input
                  name="months_selling"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className={input}
                />
              </label>
            </div>
            <div className="space-y-1">
              <span className={labelText}>Where do you sell?</span>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                {SELL_CHANNELS.map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="sell_channels" value={c} />
                    {c}
                  </label>
                ))}
              </div>
            </div>
            <label className={label}>
              <span className={labelText}>
                Page / shop links or handles{" "}
                <span className={hint}>(optional)</span>
              </span>
              <input
                name="social_handles"
                placeholder="fb.com/yourshop, @yourshop"
                className={input}
              />
            </label>
            <label className={label}>
              <span className={labelText}>Estimated monthly sales (PHP)</span>
              <input
                name="monthly_sales"
                type="number"
                min={0}
                inputMode="numeric"
                required
                className={input}
              />
            </label>
          </Section>

          <Section title="Where you buy your stock">
            <div className="space-y-1">
              <span className={labelText}>Where do you source?</span>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {SOURCING.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="sourcing" value={s} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>
                <span className={labelText}>How often do you restock?</span>
                <select
                  name="restock_frequency"
                  defaultValue=""
                  className={input}
                >
                  <option value="">Choose…</option>
                  {RESTOCK_FREQUENCY.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                <span className={labelText}>Typical restock amount (PHP)</span>
                <input
                  name="typical_restock"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className={input}
                />
              </label>
            </div>
          </Section>

          <Section title="Character references (optional)">
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="ref1_name" placeholder="Reference 1 — name" className={input} />
              <input name="ref1_contact" placeholder="Reference 1 — mobile" className={input} />
              <input name="ref2_name" placeholder="Reference 2 — name" className={input} />
              <input name="ref2_contact" placeholder="Reference 2 — mobile" className={input} />
            </div>
          </Section>
        </>
      ) : (
        <Section title="Your livelihood">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              <span className={labelText}>Employment status</span>
              <select
                name="employment_status"
                required
                defaultValue=""
                className={input}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {EMPLOYMENT_STATUS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              <span className={labelText}>
                Occupation / employer <span className={hint}>(optional)</span>
              </span>
              <input name="occupation" className={input} />
            </label>
          </div>
          <label className={label}>
            <span className={labelText}>Estimated monthly income (PHP)</span>
            <input
              name="monthly_income"
              type="number"
              min={0}
              inputMode="numeric"
              required
              className={input}
            />
          </label>
        </Section>
      )}

      {/* Cash flow */}
      <Section title="Cash flow">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            <span className={labelText}>
              Other monthly income (PHP) <span className={hint}>(optional)</span>
            </span>
            <input
              name="other_income"
              type="number"
              min={0}
              inputMode="numeric"
              className={input}
            />
          </label>
          <label className={label}>
            <span className={labelText}>
              Existing loan payments / month (PHP){" "}
              <span className={hint}>(optional)</span>
            </span>
            <input
              name="existing_loan_monthly"
              type="number"
              min={0}
              inputMode="numeric"
              className={input}
            />
          </label>
        </div>
      </Section>

      {/* Disbursement */}
      <Section title="Where you'd receive / send money">
        <p className={hint}>
          For the operator to reconcile transfers. The app itself never moves
          money.
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["ewallet", "E-wallet"],
              ["bank", "Bank account"],
            ] as ["ewallet" | "bank", string][]
          ).map(([value, text]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${
                payout === value
                  ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                  : "border-black/15 dark:border-white/15"
              }`}
            >
              <input
                type="radio"
                name="payout_method"
                value={value}
                checked={payout === value}
                onChange={() => setPayout(value)}
                className="sr-only"
              />
              {text}
            </label>
          ))}
        </div>

        {payout === "ewallet" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              <span className={labelText}>E-wallet</span>
              <select name="ewallet_provider" defaultValue="" required className={input}>
                <option value="" disabled>
                  Choose…
                </option>
                {EWALLETS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              <span className={labelText}>E-wallet mobile number</span>
              <input
                name="ewallet_number"
                inputMode="tel"
                defaultValue="+639"
                className={input}
              />
            </label>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              <span className={labelText}>Bank</span>
              <select name="bank_name" defaultValue="" required className={input}>
                <option value="" disabled>
                  Choose…
                </option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              <span className={labelText}>Account number</span>
              <input name="bank_account_number" inputMode="numeric" className={input} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              <span className={labelText}>Account name</span>
              <input name="bank_account_name" className={input} />
            </label>
          </div>
        )}
      </Section>

      {/* Consent (no credit amount — BNPL buyers are pre-approved to a
          standard starting limit after we verify identity) */}
      <Section title="Confirm & consent">
        <p className={hint}>
          No need to request an amount — approved buyers start with a standard
          pre-approved BNPL limit that grows with good repayment.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" value="yes" required className="mt-1" />
          <span>
            I confirm the information is true, and consent to verification of my
            details and references.
          </span>
        </label>
      </Section>

      <SubmitButton
        pendingText="Submitting your application…"
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
      >
        {next === "seller" ? "Submit & continue to seller" : "Submit application"}
      </SubmitButton>
    </form>
  );
}
