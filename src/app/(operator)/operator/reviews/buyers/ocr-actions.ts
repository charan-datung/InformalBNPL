"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ocrImage } from "@/lib/ocr/tesseract";
import { crossCheckId } from "@/lib/ocr/id-check";

/**
 * Operator-triggered OCR checks. They run server-side on a stored upload (never
 * on the buyer's device or in the submit path), persist the result into the
 * application JSONB, and revalidate the review page. Best-effort: OCR failure is
 * recorded as "unavailable" so the operator falls back to manual review.
 */

const BUCKET = "buyer-id";
const BACK = "/operator/reviews/buyers";

async function download(path: string): Promise<Buffer | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function runBuyerIdOcr(formData: FormData) {
  await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("buyer_profiles")
    .select("id_document_path, application")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.id_document_path) {
    revalidatePath(BACK);
    return;
  }

  const app = (profile.application as Record<string, unknown>) ?? {};
  const buf = await download(profile.id_document_path);
  const text = buf ? await ocrImage(buf) : null;

  const ocr_id_check =
    text == null
      ? {
          idNumberFound: false,
          typeKeywordFound: false,
          textPreview: "OCR unavailable — review the ID photo manually.",
          ranAt: new Date().toISOString(),
        }
      : {
          ...crossCheckId(String(app.id_type ?? ""), String(app.id_number ?? ""), text),
          ranAt: new Date().toISOString(),
        };

  await admin
    .from("buyer_profiles")
    .update({ application: { ...app, ocr_id_check } })
    .eq("user_id", userId);
  revalidatePath(BACK);
}

export async function runBuyerBillingOcr(formData: FormData) {
  await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("buyer_profiles")
    .select("application")
    .eq("user_id", userId)
    .maybeSingle();
  const app = (profile?.application as Record<string, unknown>) ?? {};
  const path = app.proof_of_billing_path as string | undefined;
  if (!path) {
    revalidatePath(BACK);
    return;
  }

  const buf = await download(path);
  const text = buf ? await ocrImage(buf) : null;
  const ocr_billing_preview =
    text == null
      ? "OCR unavailable — review the document manually."
      : text.replace(/\s+/g, " ").trim().slice(0, 400);

  await admin
    .from("buyer_profiles")
    .update({ application: { ...app, ocr_billing_preview } })
    .eq("user_id", userId);
  revalidatePath(BACK);
}
