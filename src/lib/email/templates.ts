import { LENDER } from "@/lib/legal/lender";
import { formatPeso } from "@/lib/format";

type Email = { subject: string; html: string };
const firstName = (n: string | null | undefined) =>
  n?.trim()?.split(/\s+/)[0] || "there";

/** Minimal branded wrapper for transactional emails. */
function layout(heading: string, bodyHtml: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const cta = appUrl
    ? `<p style="margin:24px 0"><a href="${appUrl}/dashboard" style="background:#0e4d45;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">Open ${LENDER.brand}</a></p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#111;line-height:1.6">
    <h1 style="font-size:20px;margin:0 0 12px">${heading}</h1>
    ${bodyHtml}
    ${cta}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
    <p style="font-size:12px;color:#666;margin:0">
      ${LENDER.legalName} — an SEC-registered lending company
      (Reg. No. ${LENDER.secRegistrationNo}, CoA No. ${LENDER.certificateOfAuthorityNo}).
    </p>
  </div>`;
}

export function approvalEmail(input: {
  name: string | null;
  capability: "buyer" | "seller";
}): { subject: string; html: string } {
  const who = input.name?.trim() || "there";
  if (input.capability === "buyer") {
    return {
      subject: "You're approved to shop on Datung",
      html: layout(
        `You're approved, ${who}! 🎉`,
        `<p>Your Datung buyer account is approved. You can now shop from Datung
         sellers and pay in installments — just scan a seller's QR or open
         their pay link to check out.</p>`,
      ),
    };
  }
  return {
    subject: "You're approved to sell on Datung",
    html: layout(
      `You're approved, ${who}! 🎉`,
      `<p>Your Datung seller account is approved. You can now create a sale, share
       a QR or link with your buyer, and get paid through Datung.</p>`,
    ),
  };
}

// ---- Transaction milestone emails ------------------------------------------

/** Seller: the buyer just paid — the "you got paid" moment. */
export function paymentReceivedSellerEmail(i: {
  sellerName: string | null;
  buyerName: string | null;
  amountCentavos: number;
  inPerson: boolean;
}): Email {
  const buyer = i.buyerName?.trim() || "A buyer";
  const next = i.inPerson
    ? "Hand the item over, then enter the buyer's 6-digit code on your dashboard to release your payout."
    : "Ship the order and mark it shipped (with a photo) to start your payout.";
  return {
    subject: `You got paid ${formatPeso(i.amountCentavos)} on ${LENDER.brand} 🎉`,
    html: layout(
      `${firstName(i.sellerName)}, you got paid ${formatPeso(i.amountCentavos)} 🎉`,
      `<p><strong>${buyer}</strong> just paid <strong>${formatPeso(i.amountCentavos)}</strong>.
       It's secured by ${LENDER.brand} and on its way to you.</p>
       <p style="color:#444">${next}</p>`,
    ),
  };
}

/** Buyer: their order is confirmed and the installment plan is ready. */
export function orderConfirmedBuyerEmail(i: {
  buyerName: string | null;
  sellerName: string | null;
  amountCentavos: number;
  tenorMonths: number;
}): Email {
  const seller = i.sellerName?.trim() || "the seller";
  return {
    subject: `You're all set — ${formatPeso(i.amountCentavos)} order confirmed`,
    html: layout(
      `You're all set, ${firstName(i.buyerName)}! 🎉`,
      `<p>Your <strong>${formatPeso(i.amountCentavos)}</strong> order from ${seller}
       is confirmed. Pay it over <strong>${i.tenorMonths} month${i.tenorMonths === 1 ? "" : "s"}</strong>
       — your full schedule is on your dashboard.</p>`,
    ),
  };
}

/** Buyer: the seller shipped / handed over the order. */
export function orderOnTheWayBuyerEmail(i: {
  buyerName: string | null;
  sellerName: string | null;
  inPerson: boolean;
}): Email {
  const seller = i.sellerName?.trim() || "the seller";
  if (i.inPerson) {
    return {
      subject: "Hand-over confirmed on Datung",
      html: layout(
        `Hand-over confirmed, ${firstName(i.buyerName)}`,
        `<p>${seller} confirmed you received your order. Enjoy! Your installment
         plan is on your dashboard.</p>`,
      ),
    };
  }
  return {
    subject: `Your order from ${seller} is on the way 📦`,
    html: layout(
      `Your order is on the way 📦`,
      `<p>${seller} just shipped your order. Once it arrives and everything looks
       good, confirm receipt on your dashboard.</p>`,
    ),
  };
}

/** Seller: the buyer confirmed delivery — payout is being released. */
export function deliveryConfirmedSellerEmail(i: {
  sellerName: string | null;
  buyerName: string | null;
}): Email {
  const buyer = i.buyerName?.trim() || "The buyer";
  return {
    subject: "Delivery confirmed — your payout is on the way",
    html: layout(
      "Delivery confirmed ✓",
      `<p>${buyer} confirmed they received their order. Your payout is being
       released — you'll see it land per your payout schedule.</p>`,
    ),
  };
}

/** Seller: escrow released — payout cleared. */
export function payoutReleasedSellerEmail(i: {
  sellerName: string | null;
  netCentavos: number;
}): Email {
  return {
    subject: `Your payout of ${formatPeso(i.netCentavos)} is released`,
    html: layout(
      `Payout released — ${formatPeso(i.netCentavos)}`,
      `<p>${firstName(i.sellerName)}, your net payout of
       <strong>${formatPeso(i.netCentavos)}</strong> has been cleared. It will
       reach you per your payout schedule.</p>`,
    ),
  };
}

/** Buyer: their order was refunded. */
export function orderRefundedBuyerEmail(i: {
  buyerName: string | null;
  amountCentavos: number;
}): Email {
  return {
    subject: "Your Datung order was refunded",
    html: layout(
      "Your order was refunded",
      `<p>${firstName(i.buyerName)}, your order has been refunded. Nothing further
       is owed on it. If you have questions, reply to this email.</p>`,
    ),
  };
}
