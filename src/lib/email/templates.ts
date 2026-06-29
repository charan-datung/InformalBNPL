import { LENDER } from "@/lib/legal/lender";

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
