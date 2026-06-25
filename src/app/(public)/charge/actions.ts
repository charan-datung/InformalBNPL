"use server";

import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import {
  createCharge,
  authorizeCharge,
  ChargeError,
  type Fulfillment,
} from "@/lib/payments/charges";

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
}

/** Seller mints a Payment Request, then lands on its QR/link page. */
export async function createChargeAction(formData: FormData) {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");
  if (caps.seller !== "verified") {
    redirect("/dashboard?error=" + encodeURIComponent("Seller capability not active."));
  }

  const amountPesos = Number(formData.get("amount_pesos") ?? 0);
  const memo = String(formData.get("memo") ?? "");
  const fulfillment: Fulfillment =
    String(formData.get("fulfillment") ?? "in_person") === "ship"
      ? "ship"
      : "in_person";

  if (!Number.isFinite(amountPesos) || amountPesos <= 0) {
    redirect("/dashboard?error=" + encodeURIComponent("Enter a valid amount."));
  }

  let id: string;
  try {
    const charge = await createCharge({
      sellerUserId: caps.userId,
      amountCentavos: Math.round(amountPesos * 100),
      memo,
      fulfillment,
    });
    id = charge.id;
  } catch (e) {
    redirect("/dashboard?error=" + encodeURIComponent(msg(e)));
  }
  redirect(`/charge/${id}`);
}

/** Buyer authorizes a Payment Request against their revolving line. */
export async function authorizeChargeAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const tenorMonths = Number(formData.get("tenor_months") ?? 0);

  const caps = await getCapabilities();
  if (!caps) redirect(`/login?next=${encodeURIComponent(`/pay/${token}`)}`);
  if (caps.buyer !== "verified") {
    redirect(`/pay/${token}?error=` + encodeURIComponent("Your account isn't approved yet."));
  }
  if (!Number.isInteger(tenorMonths) || tenorMonths <= 0) {
    redirect(`/pay/${token}?error=` + encodeURIComponent("Choose how long to pay over."));
  }

  try {
    await authorizeCharge({ token, buyerUserId: caps.userId, tenorMonths });
  } catch (e) {
    const text = e instanceof ChargeError ? e.message : msg(e);
    redirect(`/pay/${token}?error=` + encodeURIComponent(text));
  }
  redirect(`/pay/${token}?paid=1`);
}
