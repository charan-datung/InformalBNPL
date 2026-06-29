import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { createClient } from "@/lib/supabase/server";
import SellerApplicationForm, {
  type SellerPrefill,
} from "@/app/(public)/onboarding/seller/SellerApplicationForm";
import Card from "@/components/ui/Card";
import Callout from "@/components/ui/Callout";

// Session-dependent: must run per request, never statically cached.
export const dynamic = "force-dynamic";

// Buyer ID-type labels -> the seller form's ID <select> values.
const SELLER_ID_VALUE: Record<string, string> = {
  "PhilSys (National ID)": "philsys",
  UMID: "umid",
  "Driver's License": "drivers_license",
  Passport: "passport",
  "Postal ID": "postal_id",
};

/**
 * In the "Both" flow the applicant already gave their identity as a buyer, so
 * carry it over instead of asking again. Returns null when there's no buyer
 * step to draw from. Reads the user's own rows (RLS-allowed).
 */
async function buyerPrefill(): Promise<SellerPrefill | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: u }, { data: bp }] = await Promise.all([
    supabase.from("users").select("name, contact").eq("id", user.id).maybeSingle(),
    supabase
      .from("buyer_profiles")
      .select("application, id_document_path")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (!bp) return null;

  const app = (bp.application ?? {}) as Record<string, unknown>;
  const buyerIdType = String(app.id_type ?? "");
  return {
    name: u?.name ?? undefined,
    contact: u?.contact ?? undefined,
    idType: SELLER_ID_VALUE[buyerIdType] ?? (buyerIdType ? "other" : undefined),
    city: (app.city as string) ?? undefined,
    province: (app.province as string) ?? undefined,
    hasBuyerId: Boolean(bp.id_document_path),
  };
}

/**
 * Seller verification for the informal market. We don't require business
 * documents; instead an operator verifies a real person + a real selling
 * presence from three signals: a government ID, a storefront/stall photo and
 * location, and social/marketplace proof. Everything is stored in a private
 * bucket and verified during review.
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
  // Carry over identity from the buyer step when they've already done it.
  const prefill = caps.buyer !== "none" ? await buyerPrefill() : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Seller verification</h1>
        <p className="text-sm text-black/55">
          No business permits needed — just show us who you are and where you
          sell, and we&apos;ll get you verified.
        </p>
      </div>

      {prefill ? (
        <Callout tone="success" title="We carried over your buyer details">
          Just review them and add where you sell.
        </Callout>
      ) : null}

      {error ? <Callout tone="error">{error}</Callout> : null}

      <Card className="p-5 sm:p-6">
        <SellerApplicationForm prefill={prefill} />
      </Card>
    </div>
  );
}
