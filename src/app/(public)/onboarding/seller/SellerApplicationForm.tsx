"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { applyAsSeller } from "@/app/(public)/onboarding/actions";
import PinLocation from "@/app/(public)/onboarding/seller/PinLocation";
import PhLocation from "@/app/(public)/onboarding/PhLocation";
import { Field, TextInput, Select, Textarea, controlClasses } from "@/components/ui/Field";
import FileUpload from "@/components/ui/FileUpload";
import Callout from "@/components/ui/Callout";
import Wizard, { type WizardStep } from "@/components/ui/Wizard";

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

function StepIntro({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {subtitle ? <p className="text-sm text-black/55">{subtitle}</p> : null}
    </div>
  );
}

/**
 * Seller verification form for the informal market — three signals, no business
 * documents: a government ID, a storefront/stall photo + location, and
 * social/marketplace proof. Presented as a guided wizard; lives in one <form>
 * so applyAsSeller still receives a single FormData with every field.
 */
export default function SellerApplicationForm({
  prefill,
}: {
  prefill?: SellerPrefill | null;
}) {
  const idRequired = !prefill?.hasBuyerId;

  // Required photos are enforced in JS (a hidden required file input isn't
  // focusable for native validation) — each step's validate() uses these.
  const [idFilled, setIdFilled] = useState(false);
  const [storefrontFilled, setStorefrontFilled] = useState(false);
  const [itemFilled, setItemFilled] = useState(false);

  const [idError, setIdError] = useState<string | null>(null);
  const [storefrontError, setStorefrontError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);

  const steps: WizardStep[] = [
    {
      id: "who",
      title: "Who you are",
      validate: () => {
        if (idRequired && !idFilled) {
          setIdError("Please add a photo of your government ID to continue.");
          return false;
        }
        setIdError(null);
        return true;
      },
      render: (
        <>
          <StepIntro
            title="Who you are"
            subtitle="A real person behind the shop. Stored privately, reviewed by hand."
          />
          <Field label="Full name">
            <TextInput name="name" required defaultValue={prefill?.name ?? ""} />
          </Field>
          <Field label="Contact (phone or email)">
            <TextInput
              name="contact"
              required
              defaultValue={prefill?.contact ?? "+639"}
            />
          </Field>
          <Field label="Government ID type">
            <Select name="id_type" required defaultValue={prefill?.idType ?? ""}>
              <option value="" disabled>
                Select an ID…
              </option>
              <option value="philsys">PhilSys / National ID</option>
              <option value="drivers_license">Driver&apos;s license</option>
              <option value="passport">Passport</option>
              <option value="umid">UMID</option>
              <option value="postal_id">Postal ID</option>
              <option value="other">Other government ID</option>
            </Select>
          </Field>
          <FileUpload
            name="id_document"
            label={
              idRequired
                ? "Photo of your government ID"
                : "Photo of your government ID (optional)"
            }
            hint={
              prefill?.hasBuyerId
                ? "We'll reuse the ID you uploaded as a buyer — only add a photo if it's a different ID."
                : "Held by you, photographed clearly. Stored privately for review only."
            }
            error={idError}
            onFilledChange={(f) => {
              setIdFilled(f);
              if (f) setIdError(null);
            }}
          />
        </>
      ),
    },
    {
      id: "where",
      title: "Where you sell",
      validate: () => {
        if (!storefrontFilled) {
          setStorefrontError("Please add a photo of your storefront or stall.");
          return false;
        }
        setStorefrontError(null);
        return true;
      },
      render: (
        <>
          <StepIntro
            title="Where you sell"
            subtitle="Your selling presence — online and on the ground."
          />
          <Field label="Social / marketplace handle(s)">
            <TextInput
              name="social_handle"
              required
              placeholder="@yourshop, fb.com/yourshop"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Marketplace link" optional>
              <TextInput
                name="marketplace_url"
                placeholder="Shopee/Lazada/FB page"
              />
            </Field>
            <Field label="Selling since" optional>
              <TextInput name="selling_since" placeholder="e.g. 2021" />
            </Field>
          </div>
          <FileUpload
            name="storefront_photo"
            label="Storefront / stall photo"
            hint="Your stall, shelf, or where you pack orders."
            error={storefrontError}
            onFilledChange={(f) => {
              setStorefrontFilled(f);
              if (f) setStorefrontError(null);
            }}
          />
          <Field label="Address / area">
            <TextInput
              name="storefront_location"
              required
              placeholder="e.g. Stall 14, Bankerohan Public Market"
            />
          </Field>
          <PhLocation
            inputClassName={controlClasses}
            required
            provinceName="storefront_province"
            cityName="storefront_city"
            defaultProvince={prefill?.province}
            defaultCity={prefill?.city}
          />
          <PinLocation />
        </>
      ),
    },
    {
      id: "proof",
      title: "Proof you sell",
      validate: () => {
        if (!itemFilled) {
          setItemError("Please add a photo of an item you're selling now.");
          return false;
        }
        setItemError(null);
        return true;
      },
      render: (
        <>
          <StepIntro
            title="Proof you sell"
            subtitle="One last signal that you're actively trading."
          />
          <FileUpload
            name="photo"
            label="Live item photo"
            hint="A photo of something you're selling now. On a phone this opens the camera."
            error={itemError}
            onFilledChange={(f) => {
              setItemFilled(f);
              if (f) setItemError(null);
            }}
          />
          <Field label="Notes" optional>
            <Textarea name="notes" rows={3} />
          </Field>
          <Callout tone="info">
            We verify real sellers by hand — there&apos;s no instant decision.
            We&apos;ll text you once it&apos;s reviewed.
          </Callout>
        </>
      ),
    },
  ];

  return (
    <form
      action={applyAsSeller}
      encType="multipart/form-data"
      className="space-y-6"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-brand-700">
        <BadgeCheck className="size-4" /> No business permits needed — just show
        us who you are and where you sell.
      </div>
      <Wizard
        steps={steps}
        submitLabel="Submit for verification"
        pendingLabel="Submitting for verification…"
      />
    </form>
  );
}
