"use server";

import { randomInt } from "crypto";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookLoan, transitionLoan } from "@/lib/loans/mutations";
import { confirmDelivery, raiseDispute } from "@/lib/loans/buyer";
import { markShipped, confirmHandover } from "@/lib/loans/seller";
import {
  recordLoanDisclosureAcceptance,
  clientIp,
} from "@/lib/legal/acceptance";
import {
  submitPaymentReport,
  type PaymentMethod,
} from "@/lib/payments/buyer-payments";
import { recordLocationEvent } from "@/lib/location/events";

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

/** Resolve a safe internal return path from a form's redirectTo, else /dashboard. */
function backTarget(formData: FormData): string {
  const to = String(formData.get("redirectTo") ?? "");
  return /^\/(dashboard|order\/[\w-]+)$/.test(to) ? to : BACK;
}

function withParam(path: string, key: string, value: string): string {
  return `${path}?${key}=${encodeURIComponent(value)}`;
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

/** Dual-role users toggle between the buyer and seller views (cookie-backed). */
export async function setDashboardModeAction(formData: FormData) {
  const mode = String(formData.get("mode") ?? "") === "seller" ? "seller" : "buyer";
  (await cookies()).set("dash_mode", mode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  redirect("/dashboard");
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
  const inPerson = String(formData.get("fulfillment") ?? "ship") === "in_person";
  const agreed = formData.get("agree") != null;
  const signatureName = String(formData.get("signature") ?? "").trim();

  // Optional, explicitly-consented location for this purchase (the per-order
  // monitoring trail). Captured client-side only when the buyer ticks consent.
  const locationConsent = String(formData.get("location_consent") ?? "") === "yes";
  const geoLat = parseFloat(String(formData.get("geo_lat") ?? ""));
  const geoLng = parseFloat(String(formData.get("geo_lng") ?? ""));
  const geoAcc = Number(String(formData.get("geo_accuracy") ?? ""));

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
      // The disbursement ledger is posted inside this transition (exactly-once).
    });
    // In-person: mint a hand-over code (same anti-fraud as Datung Pay). Ship
    // orders stay at escrow_held until the seller marks them shipped with proof.
    if (inPerson) {
      const handoverCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await createAdminClient()
        .from("loans")
        .update({ handover_code: handoverCode })
        .eq("id", loan.id);
    }
    // Per-purchase location stamp (the monitoring trail), only if consented.
    if (locationConsent) {
      await recordLocationEvent(createAdminClient(), {
        userId: buyerUserId,
        source: "checkout",
        loanId: loan.id,
        lat: geoLat,
        lng: geoLng,
        accuracyM: Number.isFinite(geoAcc) ? geoAcc : null,
      });
    }
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

/** Buyer reports a payment they've made (reference #) for operator confirmation. */
export async function reportPaymentAction(formData: FormData) {
  const buyerUserId = await requireBuyer();
  const loanId = String(formData.get("loanId") ?? "");
  const amountPesos = Number(formData.get("amount_pesos") ?? 0);
  const referenceNo = String(formData.get("reference_no") ?? "");
  const methodRaw = String(formData.get("method") ?? "gcash");
  const method: PaymentMethod = (["gcash", "maya", "bank", "other"] as const).includes(
    methodRaw as PaymentMethod,
  )
    ? (methodRaw as PaymentMethod)
    : "other";

  try {
    await submitPaymentReport({
      loanId,
      buyerUserId,
      amountCentavos: Math.round(amountPesos * 100),
      referenceNo,
      method,
    });
  } catch (e) {
    redirect(`${BACK}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(
    `${BACK}?ok=${encodeURIComponent("Payment submitted — your operator will confirm it shortly.")}`,
  );
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

/**
 * Seller confirms an in-person hand-over by entering the buyer's 6-digit code:
 * escrow_held -> shipped (starts the dispute window). Anti-fraud — proves the
 * goods changed hands instead of silently auto-advancing.
 */
export async function confirmHandoverAction(formData: FormData) {
  const sellerUserId = await requireSeller();
  const loanId = String(formData.get("loanId") ?? "");
  const code = String(formData.get("code") ?? "");
  const back = backTarget(formData);

  try {
    await confirmHandover({ loanId, sellerUserId, code });
  } catch (e) {
    redirect(withParam(back, "error", errorMessage(e)));
  }
  redirect(
    withParam(back, "ok", "Hand-over confirmed — your payout is on the way."),
  );
}

/** Seller marks shipped with required proof: escrow_held -> shipped. */
export async function markShippedAction(formData: FormData) {
  const sellerUserId = await requireSeller();
  const loanId = String(formData.get("loanId") ?? "");
  const back = backTarget(formData);

  try {
    const proofPath = await uploadImage(
      SHIPMENT_BUCKET,
      sellerUserId,
      "proof",
      formData.get("proof"),
    );
    await markShipped({ loanId, sellerUserId, proofPath });
  } catch (e) {
    redirect(withParam(back, "error", errorMessage(e)));
  }
  redirect(
    withParam(back, "ok", "Marked as shipped — we'll let the buyer know."),
  );
}
