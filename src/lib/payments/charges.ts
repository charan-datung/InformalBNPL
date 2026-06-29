import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookLoan, transitionLoan } from "@/lib/loans/mutations";
import type { PaymentFrequency } from "@/lib/loans/schedule";
import { getBuyerCredit } from "@/lib/loans/credit";
import { postLoanDisbursement } from "@/lib/ledger/post";
import { recordLoanDisclosureAcceptance } from "@/lib/legal/acceptance";
import { captureException } from "@/lib/observability/logger";

/**
 * Datung Pay — the seller-initiated Payment Request ("Charge").
 *
 * Flow: a verified seller mints a charge (amount locked) -> shares it as a QR /
 * exclusive link -> a pre-approved buyer authorizes it against their revolving
 * line, which books a loan instantly and posts the double-entry ledger.
 *
 * All access is server-side via the service role.
 */

export type Fulfillment = "in_person" | "ship";

export type Charge = {
  id: string;
  token: string;
  seller_user_id: string;
  amount_centavos: number;
  memo: string | null;
  fulfillment: Fulfillment;
  status: "pending" | "authorized" | "expired" | "cancelled";
  buyer_user_id: string | null;
  loan_id: string | null;
  expires_at: string;
  authorized_at: string | null;
  created_at: string;
};

/** How long a freshly-minted charge stays scannable. */
const TTL_MINUTES = 30;

export class ChargeError extends Error {}

/**
 * Translate a raw booking error into a buyer-friendly message. The seller's
 * exposure cap being full is the SELLER's limit, not the buyer's fault, so we
 * never show the raw cap math to the buyer (the real reason is logged for ops).
 */
function friendlyChargeError(e: unknown): ChargeError {
  const msg = e instanceof Error ? e.message : "";
  if (/seller exposure cap/i.test(msg)) {
    return new ChargeError(
      "This seller can't accept new orders right now. Please try again later or contact the seller.",
    );
  }
  if (/available credit/i.test(msg)) {
    return new ChargeError(
      "This is more than your available credit right now. Pay down a loan and try again.",
    );
  }
  return e instanceof ChargeError
    ? e
    : new ChargeError("We couldn't complete this payment. Please try again.");
}

function newToken(): string {
  return randomBytes(12).toString("base64url"); // ~16 url-safe chars
}

export async function createCharge(input: {
  sellerUserId: string;
  amountCentavos: number;
  memo?: string | null;
  fulfillment: Fulfillment;
}): Promise<Charge> {
  const admin = createAdminClient();

  if (!Number.isInteger(input.amountCentavos) || input.amountCentavos <= 0) {
    throw new ChargeError("Enter a valid amount.");
  }

  const { data: seller } = await admin
    .from("seller_profiles")
    .select("kyc_status, activated_at")
    .eq("user_id", input.sellerUserId)
    .maybeSingle();
  if (!seller || seller.kyc_status !== "verified" || !seller.activated_at) {
    throw new ChargeError("Seller capability is not active.");
  }

  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString();
  const { data, error } = await admin
    .from("payment_requests")
    .insert({
      token: newToken(),
      seller_user_id: input.sellerUserId,
      amount_centavos: input.amountCentavos,
      memo: input.memo?.trim() || null,
      fulfillment: input.fulfillment,
      expires_at: expiresAt,
    })
    .select("*")
    .single<Charge>();
  if (error) throw new ChargeError(error.message);
  return data;
}

export type ChargeWithSeller = Charge & { sellerName: string };

async function attachSeller(admin: ReturnType<typeof createAdminClient>, c: Charge): Promise<ChargeWithSeller> {
  const { data: u } = await admin
    .from("users")
    .select("name")
    .eq("id", c.seller_user_id)
    .maybeSingle();
  return { ...c, sellerName: u?.name ?? "Seller" };
}

export async function getChargeByToken(token: string): Promise<ChargeWithSeller | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("payment_requests")
    .select("*")
    .eq("token", token)
    .maybeSingle<Charge>();
  if (!data) return null;
  return attachSeller(admin, data);
}

export async function getChargeById(id: string): Promise<ChargeWithSeller | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("payment_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<Charge>();
  if (!data) return null;
  return attachSeller(admin, data);
}

/** True once a pending charge has passed its expiry (and best-effort mark it). */
export async function isExpired(c: Charge): Promise<boolean> {
  if (c.status !== "pending") return c.status === "expired";
  if (new Date(c.expires_at).getTime() > Date.now()) return false;
  const admin = createAdminClient();
  await admin
    .from("payment_requests")
    .update({ status: "expired" })
    .eq("id", c.id)
    .eq("status", "pending");
  return true;
}

/**
 * Authorize a charge against the buyer's revolving line. Single-use is enforced
 * by a compare-and-set on status (pending -> authorized); a second concurrent
 * attempt finds no pending row and is rejected. On any downstream failure the
 * CAS is reverted so the charge stays usable.
 */
export async function authorizeCharge(input: {
  token: string;
  buyerUserId: string;
  tenorMonths: number;
  paymentFrequency?: PaymentFrequency;
  /** Typed-name e-signature accepting the loan's disclosure documents. */
  signatureName?: string | null;
  ipAddress?: string | null;
}): Promise<{ loanId: string }> {
  const admin = createAdminClient();

  const { data: charge } = await admin
    .from("payment_requests")
    .select("*")
    .eq("token", input.token)
    .maybeSingle<Charge>();
  if (!charge) throw new ChargeError("This payment request was not found.");
  if (charge.status === "authorized") {
    throw new ChargeError("This payment request was already paid.");
  }
  if (charge.status !== "pending" || (await isExpired(charge))) {
    throw new ChargeError("This payment request has expired.");
  }
  if (charge.seller_user_id === input.buyerUserId) {
    throw new ChargeError("You can't pay your own request.");
  }

  // Revolving-credit gate (book_loan re-checks identity/KYC).
  const credit = await getBuyerCredit(input.buyerUserId);
  if (charge.amount_centavos > credit.availableCentavos) {
    throw new ChargeError(
      "This exceeds your available credit. Pay down a loan and try again.",
    );
  }

  // Claim the charge atomically (single-use).
  const { data: claimed } = await admin
    .from("payment_requests")
    .update({
      status: "authorized",
      buyer_user_id: input.buyerUserId,
      authorized_at: new Date().toISOString(),
    })
    .eq("id", charge.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) {
    throw new ChargeError("This payment request is no longer available.");
  }

  try {
    const loan = await bookLoan({
      buyerUserId: input.buyerUserId,
      sellerUserId: charge.seller_user_id,
      ticketCentavos: charge.amount_centavos,
      tenorMonths: input.tenorMonths,
      paymentFrequency: input.paymentFrequency,
      actorUserId: input.buyerUserId,
      note: `Datung Pay (${charge.fulfillment})`,
    });
    // Credit committed -> escrow held (mirrors checkout). For in_person the
    // goods change hands now; the seller-payout obligation is in the ledger.
    await transitionLoan({
      loanId: loan.id,
      to: "escrow_held",
      actorUserId: input.buyerUserId,
      amountCentavos: loan.ticket_centavos,
      note: "Escrow held on Datung Pay authorization",
    });
    await admin
      .from("payment_requests")
      .update({ loan_id: loan.id })
      .eq("id", charge.id);
    // Record the borrower's acceptance of the loan's disclosure (with a terms
    // snapshot) right after booking. Best-effort: never blocks the purchase.
    if (input.signatureName) {
      await recordLoanDisclosureAcceptance({
        loan,
        userId: input.buyerUserId,
        signatureName: input.signatureName,
        ipAddress: input.ipAddress ?? null,
      });
    }
    // Withhold the seller's rolling reserve as a separate ledger liability.
    const { data: sellerProfile } = await admin
      .from("seller_profiles")
      .select("rolling_reserve_pct")
      .eq("user_id", charge.seller_user_id)
      .maybeSingle();
    await postLoanDisbursement(admin, {
      loanId: loan.id,
      ticketCentavos: loan.ticket_centavos,
      merchantFeePct: loan.merchant_fee_pct,
      reservePct: sellerProfile?.rolling_reserve_pct ?? 0,
      processingFeeCentavos: loan.processing_fee_centavos,
    });

    // Authorization is now committed (loan booked, escrow held, ledger posted,
    // charge marked authorized). Conservative posture: even an in-person sale
    // stays in escrow to protect the buyer. We only record the hand-off (→
    // shipped) so the goods-exchanged fact is captured; escrow then releases the
    // normal way — buyer confirms receipt, or the short auto-release window
    // elapses — before repayment begins. (Ship orders stay at escrow_held until
    // the seller marks them shipped with proof.) Best-effort: a failure here
    // simply leaves the loan at escrow_held, never rolled back.
    if (charge.fulfillment === "in_person") {
      try {
        await transitionLoan({
          loanId: loan.id,
          to: "shipped",
          actorUserId: input.buyerUserId,
          note: "In-person hand-off (escrow held until receipt/auto-release)",
        });
      } catch (advanceErr) {
        captureException(advanceErr, {
          where: "authorizeCharge.inPersonHandoff",
          loanId: loan.id,
          chargeId: charge.id,
        });
      }
    }

    return { loanId: loan.id };
  } catch (e) {
    // Roll the claim back so the buyer can retry / the QR stays valid.
    await admin
      .from("payment_requests")
      .update({ status: "pending", buyer_user_id: null, authorized_at: null })
      .eq("id", charge.id);
    captureException(e, { where: "authorizeCharge.book", chargeId: charge.id });
    throw friendlyChargeError(e);
  }
}

export async function listSellerCharges(
  sellerUserId: string,
  limit = 10,
): Promise<Charge[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("payment_requests")
    .select("*")
    .eq("seller_user_id", sellerUserId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Charge[];
}
