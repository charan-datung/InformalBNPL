"use server";

import { revalidatePath } from "next/cache";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Account-management actions for the dashboard Profile section. Identity comes
 * from the verified session — a user can only ever edit their own rows. These
 * use the `useActionState` shape (prevState, formData) -> ActionState so the
 * inline editor can show success/error without a navigation.
 *
 * Only self-serviceable fields are writable here: display name + contact for
 * everyone, and storefront/social details for sellers. Underwriting-controlled
 * fields (credit limit, KYC status, trust tier) are deliberately read-only.
 */

export type ActionState = { ok?: boolean; error?: string };

const BACK = "/dashboard";

/** Update the user's display name and contact. */
export async function updateAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const caps = await getCapabilities();
  if (!caps) return { error: "You're not signed in." };

  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();

  if (!name) return { error: "Name can't be empty." };
  if (name.length > 80) return { error: "Name is too long." };
  if (contact.length > 120) return { error: "Contact is too long." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ name, contact: contact || null })
    .eq("id", caps.userId);

  if (error) return { error: "Couldn't save — please try again." };

  revalidatePath(BACK);
  return { ok: true };
}

/** Update a seller's storefront details (social handle, links, location). */
export async function updateSellerStorefrontAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const caps = await getCapabilities();
  if (!caps) return { error: "You're not signed in." };
  if (caps.seller !== "verified") {
    return { error: "Seller capability isn't active." };
  }

  const socialHandle = String(formData.get("social_handle") ?? "").trim();
  const marketplaceUrl = String(formData.get("marketplace_url") ?? "").trim();
  const storefrontLocation = String(
    formData.get("storefront_location") ?? "",
  ).trim();
  const sellingSince = String(formData.get("selling_since") ?? "").trim();

  if (marketplaceUrl && !/^https?:\/\/\S+$/i.test(marketplaceUrl)) {
    return { error: "Shop link must start with http:// or https://" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("seller_profiles")
    .update({
      social_handle: socialHandle || null,
      marketplace_url: marketplaceUrl || null,
      storefront_location: storefrontLocation || null,
      selling_since: sellingSince || null,
    })
    .eq("user_id", caps.userId);

  if (error) return { error: "Couldn't save — please try again." };

  revalidatePath(BACK);
  return { ok: true };
}
