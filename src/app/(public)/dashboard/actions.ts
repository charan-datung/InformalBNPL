"use server";

import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookLoan, transitionLoan } from "@/lib/loans/mutations";
import { confirmDelivery, raiseDispute } from "@/lib/loans/buyer";
import { markShipped } from "@/lib/loans/seller";
import {
  recordLoanDisclosureAcceptance,
  clientIp,
} from "@/lib/legal/acceptance";

/**
 * Buyer- and seller-initiated actions from the active dashboards. Identity comes
 * from the verified session; users can only act on their own loans (enforced in
 * the buyer/seller mutation helpers). Every action redirects back to /dashboard,
 * with ?error=… on failure.
 */

const DISPUTE_BUCKET = "dispute-evidence";
const SHIPMENT_BUCKET = "shipment-proof";
const BACK = "/dashboard";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
}

/** Upload a required image to a private bucket; returns the stored path. */
async function uploadImage(
  bucket: string,
  ownerId: string,
  label: string,
  file: FormDataEntryValue | null,
): Promise<string> {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error(`A ${label} image is required.`);
  }
  if (!file.type.startsWith("image/")) {
    throw new Error(`The ${label} must be an image.`);
  }
  const admin = createAdminClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${ownerId}/${Date.now()}-${label}.${ext}`;
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
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

// ---- Buyer -----------------------------------------------------------------

/** Checkout: book the loan and immediately move it to escrow_held. */
export async function checkoutAction(formData: FormData) {
  const buyerUserId = await requireBuyer();

  const sellerUserId = String(formData.get("seller_user_id") ?? "");
  const amountPesos = Number(formData.get("amount_pesos") ?? 0);
  const tenorMonths = Number(formData.get("tenor_months") ?? 0);
  const paymentFrequency =
    String(formData.get("payment_frequency") ?? "monthly") === "biweekly"
      ? "biweekly"
      : "monthly";
  const agreed = formData.get("agree") != null;
  const signatureName = String(formData.get("signature") ?? "").trim();

  if (!agreed || !signatureName) {
    redirect(
      `${BACK}?error=${encodeURIComponent(
        "Please review and agree to the loan terms, and type your name to sign.",
      )}`,
    );
  }

  try {
    const loan = await bookLoan({
      buyerUserId,
      sellerUserId,
      ticketCentavos: Math.round(amountPesos * 100),
      tenorMonths,
      paymentFrequency,
      actorUserId: buyerUserId,
      note: "Buyer checkout",
    });
    await recordLoanDisclosureAcceptance({
      loan,
      userId: buyerUserId,
      signatureName,
      ipAddress: await clientIp(),
    });
    await transitionLoan({
      loanId: loan.id,
      to: "escrow_held",
      actorUserId: buyerUserId,
      amountCentavos: loan.ticket_centavos,
      note: "Escrow held on checkout",
    });
  } catch (e) {
    // Don't show the seller's exposure-cap math to the buyer — it's the seller's
    // limit, not their fault. Map known cases to friendly copy; raw otherwise.
    const raw = errorMessage(e);
    const msg = /seller exposure cap/i.test(raw)
      ? "This seller can't accept new orders right now. Please try again later."
      : /available credit/i.test(raw)
        ? "That's more than you can spend right now. Try a smaller amount."
        : raw;
    redirect(`${BACK}?error=${encodeURIComponent(msg)}`);
  }
  redirect(BACK);
}

/** Buyer confirms receipt: shipped -> delivered_confirmed. */
export async function confirmReceiptAction(formData: FormData) {
  const buyerUserId = await requireBuyer();
  const loanId = String(formData.get("loanId") ?? "");

  try {
    await confirmDelivery({ loanId, buyerUserId });
  } catch (e) {
    redirect(`${BACK}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(BACK);
}

/** Buyer reports a problem: required photo + description -> dispute_raised. */
export async function reportProblemAction(formData: FormData) {
  const buyerUserId = await requireBuyer();
  const loanId = String(formData.get("loanId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) {
    redirect(`${BACK}?error=${encodeURIComponent("A description is required.")}`);
  }

  try {
    const evidencePath = await uploadImage(
      DISPUTE_BUCKET,
      buyerUserId,
      "evidence",
      formData.get("evidence"),
    );
    await raiseDispute({ loanId, buyerUserId, reason, evidencePath });
  } catch (e) {
    redirect(`${BACK}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(BACK);
}

// ---- Seller ----------------------------------------------------------------

/** Seller marks shipped with required proof: escrow_held -> shipped. */
export async function markShippedAction(formData: FormData) {
  const sellerUserId = await requireSeller();
  const loanId = String(formData.get("loanId") ?? "");

  try {
    const proofPath = await uploadImage(
      SHIPMENT_BUCKET,
      sellerUserId,
      "proof",
      formData.get("proof"),
    );
    await markShipped({ loanId, sellerUserId, proofPath });
  } catch (e) {
    redirect(`${BACK}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(BACK);
}
