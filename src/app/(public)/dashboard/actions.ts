"use server";

import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookLoan } from "@/lib/loans/mutations";
import { confirmDelivery, raiseDispute } from "@/lib/loans/buyer";
import { markShipped } from "@/lib/loans/seller";

/**
 * Buyer-initiated actions from the dashboard. Identity comes from the verified
 * session; the buyer can only act on their own loans (enforced in the buyer
 * mutation helpers). Every action redirects back to /dashboard, with ?error=…
 * on failure.
 */

const DISPUTE_BUCKET = "dispute-evidence";
const BACK = "/dashboard";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
}

async function requireBuyer(): Promise<string> {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");
  if (caps.buyer !== "verified") {
    redirect(`${BACK}?error=${encodeURIComponent("Buyer capability not active.")}`);
  }
  return caps.userId;
}

async function requireSeller(): Promise<string> {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");
  if (caps.seller !== "verified") {
    redirect(
      `${BACK}?error=${encodeURIComponent("Seller capability not active.")}`,
    );
  }
  return caps.userId;
}

export async function markShippedAction(formData: FormData) {
  const sellerUserId = await requireSeller();
  const loanId = String(formData.get("loanId") ?? "");

  try {
    await markShipped({ loanId, sellerUserId });
  } catch (e) {
    redirect(`${BACK}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(BACK);
}

export async function createPurchaseAction(formData: FormData) {
  const buyerUserId = await requireBuyer();

  const sellerUserId = String(formData.get("seller_user_id") ?? "");
  const amountPesos = Number(formData.get("amount_pesos") ?? 0);
  const tenorMonths = Number(formData.get("tenor_months") ?? 0);

  try {
    await bookLoan({
      buyerUserId,
      sellerUserId,
      ticketCentavos: Math.round(amountPesos * 100),
      tenorMonths,
      actorUserId: buyerUserId,
      note: "Buyer-initiated purchase",
    });
  } catch (e) {
    redirect(`${BACK}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(BACK);
}

export async function confirmDeliveryAction(formData: FormData) {
  const buyerUserId = await requireBuyer();
  const loanId = String(formData.get("loanId") ?? "");

  try {
    await confirmDelivery({ loanId, buyerUserId });
  } catch (e) {
    redirect(`${BACK}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(BACK);
}

export async function raiseDisputeAction(formData: FormData) {
  const buyerUserId = await requireBuyer();
  const loanId = String(formData.get("loanId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const photo = formData.get("evidence");

  if (!reason) {
    redirect(`${BACK}?error=${encodeURIComponent("A reason is required.")}`);
  }

  try {
    let evidencePath: string | null = null;

    // Optional evidence photo -> private bucket via service role.
    if (photo instanceof File && photo.size > 0) {
      if (!photo.type.startsWith("image/")) {
        redirect(
          `${BACK}?error=${encodeURIComponent("Evidence must be an image.")}`,
        );
      }
      const admin = createAdminClient();
      const ext = photo.name.includes(".") ? photo.name.split(".").pop() : "jpg";
      evidencePath = `${buyerUserId}/${Date.now()}-evidence.${ext}`;
      const { error: uploadError } = await admin.storage
        .from(DISPUTE_BUCKET)
        .upload(evidencePath, Buffer.from(await photo.arrayBuffer()), {
          contentType: photo.type,
          upsert: true,
        });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    }

    await raiseDispute({ loanId, buyerUserId, reason, evidencePath });
  } catch (e) {
    redirect(`${BACK}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(BACK);
}
