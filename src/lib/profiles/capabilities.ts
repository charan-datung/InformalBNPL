import { createClient } from "@/lib/supabase/server";

/**
 * Capability state for the logged-in identity.
 *
 * A single user independently holds buyer and/or seller capability, each with
 * its own approval status. This is the source of truth the public routes use to
 * decide what to show: role selection, an "under review" screen, or the active
 * dashboard.
 */

/** Approval state of one capability. 'none' = the user hasn't applied for it. */
export type CapabilityStatus = "none" | "pending" | "verified" | "rejected";

export type Capabilities = {
  userId: string;
  email: string | null;
  buyer: CapabilityStatus;
  seller: CapabilityStatus;
};

/**
 * Read the current user's capabilities, or null if not logged in. RLS lets a
 * user read their own profile rows, so the cookie-based server client is enough.
 */
export async function getCapabilities(): Promise<Capabilities | null> {
  // Before Supabase is configured (e.g. a fresh clone), treat everyone as
  // logged out so public pages still render instead of crashing.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: buyer }, { data: seller }] = await Promise.all([
    supabase
      .from("buyer_profiles")
      .select("kyc_status")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("seller_profiles")
      .select("kyc_status")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return {
    userId: user.id,
    email: user.email ?? null,
    buyer: (buyer?.kyc_status as CapabilityStatus) ?? "none",
    seller: (seller?.kyc_status as CapabilityStatus) ?? "none",
  };
}

/** True if the user has applied for neither capability (Stage 2 territory). */
export function hasNoCapability(c: Capabilities): boolean {
  return c.buyer === "none" && c.seller === "none";
}

/** True if at least one capability is approved (Stage 4 territory). */
export function hasAnyApproved(c: Capabilities): boolean {
  return c.buyer === "verified" || c.seller === "verified";
}
