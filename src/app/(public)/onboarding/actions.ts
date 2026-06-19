"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stage 3 onboarding: a logged-in user applies for buyer and/or seller
 * capability. Identity comes from the session; writes go through the service
 * role (clients have no write policies). Both profiles are created with
 * kyc_status 'pending' — underwriting/verification is manual, done by an
 * operator. No automated decision happens here.
 */

const SELLER_BUCKET = "seller-verification";

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

export async function applyAsBuyer(formData: FormData) {
  const userId = await requireUserId();

  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const monthlyIncome = String(formData.get("monthly_income") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const next = String(formData.get("next") ?? "").trim();

  if (!name || !contact) {
    redirect(
      "/onboarding/buyer?error=" +
        encodeURIComponent("Name and contact are required."),
    );
  }

  const admin = createAdminClient();

  // Onboarding is the first place we capture a real name/contact.
  await admin.from("users").update({ name, contact }).eq("id", userId);

  const underwritingNotes = [
    monthlyIncome ? `Stated monthly income: ${monthlyIncome}` : null,
    details || null,
  ]
    .filter(Boolean)
    .join("\n");

  const { error } = await admin.from("buyer_profiles").upsert(
    {
      user_id: userId,
      kyc_status: "pending",
      underwriting_notes: underwritingNotes || null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    redirect("/onboarding/buyer?error=" + encodeURIComponent(error.message));
  }

  // "Both" flow: after the buyer step, continue to the seller step.
  redirect(next === "seller" ? "/onboarding/seller" : "/dashboard");
}

export async function applyAsSeller(formData: FormData) {
  const userId = await requireUserId();

  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const socialHandle = String(formData.get("social_handle") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const photo = formData.get("photo");

  if (!name || !contact || !socialHandle) {
    redirect(
      "/onboarding/seller?error=" +
        encodeURIComponent("Name, contact, and social handle are required."),
    );
  }
  if (!(photo instanceof File) || photo.size === 0) {
    redirect(
      "/onboarding/seller?error=" +
        encodeURIComponent("A live item photo is required."),
    );
  }
  if (!photo.type.startsWith("image/")) {
    redirect(
      "/onboarding/seller?error=" +
        encodeURIComponent("The item photo must be an image."),
    );
  }

  const admin = createAdminClient();

  // Upload the live item photo to the private bucket (service role).
  const ext = photo.name.includes(".") ? photo.name.split(".").pop() : "jpg";
  const path = `${userId}/${Date.now()}-live-item.${ext}`;
  const buffer = Buffer.from(await photo.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(SELLER_BUCKET)
    .upload(path, buffer, { contentType: photo.type, upsert: true });

  if (uploadError) {
    redirect(
      "/onboarding/seller?error=" +
        encodeURIComponent("Photo upload failed: " + uploadError.message),
    );
  }

  await admin.from("users").update({ name, contact }).eq("id", userId);

  const { error } = await admin.from("seller_profiles").upsert(
    {
      user_id: userId,
      social_handle: socialHandle,
      kyc_status: "pending",
      verification_notes: notes || null,
      verification_photo_path: path,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    redirect("/onboarding/seller?error=" + encodeURIComponent(error.message));
  }

  redirect("/dashboard");
}
