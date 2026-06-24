"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ocrImage } from "@/lib/ocr/tesseract";

/**
 * Operator-triggered OCR for seller verification. Runs Tesseract server-side on
 * a stored seller upload (government ID or storefront photo), persists the
 * extracted text on the seller profile, and revalidates the review page. The
 * seller form collects no ID number, so this surfaces raw text for the operator
 * to eyeball rather than cross-checking a value. Best-effort: failure is stored
 * as "unavailable" so the operator falls back to manual review.
 */

const BUCKET = "seller-verification";
const BACK = "/operator/reviews/sellers";

async function ocrColumn(
  userId: string,
  pathColumn: "id_document_path" | "storefront_photo_path",
  textColumn: "ocr_id_text" | "ocr_storefront_text",
) {
  await requireStaff();
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("seller_profiles")
    .select(pathColumn)
    .eq("user_id", userId)
    .maybeSingle();
  const path = (profile as Record<string, string | null> | null)?.[pathColumn];
  if (!path) {
    revalidatePath(BACK);
    return;
  }

  const { data: file, error } = await admin.storage.from(BUCKET).download(path);
  const result =
    file && !error
      ? await ocrImage(Buffer.from(await file.arrayBuffer()))
      : null;
  const value =
    result == null
      ? "Could not load the uploaded file for OCR."
      : result.ok
        ? result.text.replace(/\s+/g, " ").trim().slice(0, 400) ||
          "OCR ran but found no readable text in this photo."
        : `OCR failed: ${result.error}`.slice(0, 400);

  await admin
    .from("seller_profiles")
    .update({ [textColumn]: value })
    .eq("user_id", userId);
  revalidatePath(BACK);
}

export async function runSellerIdOcr(formData: FormData) {
  await ocrColumn(String(formData.get("userId") ?? ""), "id_document_path", "ocr_id_text");
}

export async function runSellerStorefrontOcr(formData: FormData) {
  await ocrColumn(
    String(formData.get("userId") ?? ""),
    "storefront_photo_path",
    "ocr_storefront_text",
  );
}
