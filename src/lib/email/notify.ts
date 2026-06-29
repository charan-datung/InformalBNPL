import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import {
  approvalEmail,
  paymentReceivedSellerEmail,
  orderConfirmedBuyerEmail,
  orderOnTheWayBuyerEmail,
  deliveryConfirmedSellerEmail,
  payoutReleasedSellerEmail,
  orderRefundedBuyerEmail,
} from "@/lib/email/templates";

/**
 * Email a buyer/seller that their application was approved. Best-effort: looks up
 * the auth email + display name via the service-role client and sends; any
 * failure is logged and swallowed so it never blocks the approval.
 */
export async function sendApprovalEmail(
  admin: SupabaseClient,
  userId: string,
  capability: "buyer" | "seller",
): Promise<void> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    if (error || !email) return;
    const { data: u } = await admin
      .from("users")
      .select("name")
      .eq("id", userId)
      .maybeSingle();
    const { subject, html } = approvalEmail({ name: u?.name ?? null, capability });
    await sendEmail({ to: email, subject, html });
  } catch (e) {
    console.error("sendApprovalEmail failed:", e);
  }
}

// ---- Transaction milestone notifications -----------------------------------

/** A loan as the milestone dispatcher needs it (a superset of mutation results). */
type MilestoneLoan = {
  id: string;
  buyer_user_id: string;
  seller_user_id: string;
  ticket_centavos: number;
  tenor_months: number;
  merchant_fee_pct: number;
};

/** Resolve a user's email + display name (service role). Null email = no send. */
async function recipient(
  admin: SupabaseClient,
  userId: string,
): Promise<{ email: string | null; name: string | null }> {
  const [{ data: au }, { data: u }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("users").select("name").eq("id", userId).maybeSingle(),
  ]);
  return { email: au?.user?.email ?? null, name: u?.name ?? null };
}

/** Is this loan an in-person (hand-over-code) sale? Best-effort. */
async function isInPerson(admin: SupabaseClient, loanId: string): Promise<boolean> {
  const { data } = await admin
    .from("loans")
    .select("handover_code")
    .eq("id", loanId)
    .maybeSingle();
  return Boolean(data?.handover_code);
}

/**
 * Send the right milestone email(s) for a loan status change. Called from the
 * mutation core so it fires no matter who triggered the transition (buyer,
 * seller, or operator). Entirely best-effort: never throws, never blocks.
 */
export async function notifyLoanStatus(
  admin: SupabaseClient,
  status: string,
  loan: MilestoneLoan,
  extra?: { netCentavos?: number },
): Promise<void> {
  if (!emailConfigured()) return;
  try {
    switch (status) {
      case "escrow_held": {
        const [seller, buyer, inPerson] = await Promise.all([
          recipient(admin, loan.seller_user_id),
          recipient(admin, loan.buyer_user_id),
          isInPerson(admin, loan.id),
        ]);
        if (seller.email) {
          const m = paymentReceivedSellerEmail({
            sellerName: seller.name,
            buyerName: buyer.name,
            amountCentavos: loan.ticket_centavos,
            inPerson,
          });
          await sendEmail({ to: seller.email, ...m });
        }
        if (buyer.email) {
          const m = orderConfirmedBuyerEmail({
            buyerName: buyer.name,
            sellerName: seller.name,
            amountCentavos: loan.ticket_centavos,
            tenorMonths: loan.tenor_months,
          });
          await sendEmail({ to: buyer.email, ...m });
        }
        break;
      }
      case "shipped": {
        const [seller, buyer, inPerson] = await Promise.all([
          recipient(admin, loan.seller_user_id),
          recipient(admin, loan.buyer_user_id),
          isInPerson(admin, loan.id),
        ]);
        if (buyer.email) {
          const m = orderOnTheWayBuyerEmail({
            buyerName: buyer.name,
            sellerName: seller.name,
            inPerson,
          });
          await sendEmail({ to: buyer.email, ...m });
        }
        break;
      }
      case "delivered_confirmed":
      case "auto_released": {
        const [seller, buyer] = await Promise.all([
          recipient(admin, loan.seller_user_id),
          recipient(admin, loan.buyer_user_id),
        ]);
        if (seller.email) {
          const m = deliveryConfirmedSellerEmail({
            sellerName: seller.name,
            buyerName: buyer.name,
          });
          await sendEmail({ to: seller.email, ...m });
        }
        break;
      }
      case "escrow_released": {
        const seller = await recipient(admin, loan.seller_user_id);
        if (seller.email) {
          const fee = Math.round(
            (loan.ticket_centavos * loan.merchant_fee_pct) / 100,
          );
          const m = payoutReleasedSellerEmail({
            sellerName: seller.name,
            netCentavos: extra?.netCentavos ?? loan.ticket_centavos - fee,
          });
          await sendEmail({ to: seller.email, ...m });
        }
        break;
      }
      case "refunded": {
        const buyer = await recipient(admin, loan.buyer_user_id);
        if (buyer.email) {
          const m = orderRefundedBuyerEmail({
            buyerName: buyer.name,
            amountCentavos: loan.ticket_centavos,
          });
          await sendEmail({ to: buyer.email, ...m });
        }
        break;
      }
    }
  } catch (e) {
    console.error("notifyLoanStatus failed:", e);
  }
}
