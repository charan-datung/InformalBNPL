import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Revolving buyer credit.
 *
 * A buyer is underwritten ONCE to a credit limit; from then on every purchase
 * is an authorization against what's still available. Available = limit minus
 * outstanding exposure (the ticket of every loan that hasn't settled or
 * refunded), and it frees up again as loans settle. This is what makes repeat
 * instant checkout possible.
 */

export type BuyerCredit = {
  limitCentavos: number;
  outstandingCentavos: number;
  availableCentavos: number;
};

// Loans in these states no longer tie up the line. Kept in sync with the
// outstanding-exposure filter inside the book_loan SQL guard (migration 0013).
export const RELEASED_STATUSES = ["settled", "refunded"];

/**
 * Pure revolving-credit math: available = limit − outstanding (sum of every
 * loan that hasn't settled/refunded), clamped at zero. Unit-testable.
 */
export function availableFromLoans(
  limitCentavos: number,
  loans: { ticket_centavos: number; status: string }[],
): BuyerCredit {
  const outstandingCentavos = loans
    .filter((l) => !RELEASED_STATUSES.includes(l.status))
    .reduce((sum, l) => sum + l.ticket_centavos, 0);
  return {
    limitCentavos,
    outstandingCentavos,
    availableCentavos: Math.max(0, limitCentavos - outstandingCentavos),
  };
}

export async function getBuyerCredit(userId: string): Promise<BuyerCredit> {
  const admin = createAdminClient();

  const [{ data: profile }, { data: loans }] = await Promise.all([
    admin
      .from("buyer_profiles")
      .select("credit_limit_centavos")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("loans")
      .select("ticket_centavos, status")
      .eq("buyer_user_id", userId),
  ]);

  return availableFromLoans(profile?.credit_limit_centavos ?? 0, loans ?? []);
}

/**
 * Seller exposure: how much more the platform will carry for this seller right
 * now. available = max_outstanding − outstanding (unsettled loans they sold).
 * Mirrors the seller-side guard inside book_loan (migration 0014).
 */
export async function getSellerExposure(userId: string): Promise<BuyerCredit> {
  const admin = createAdminClient();

  const [{ data: profile }, { data: loans }] = await Promise.all([
    admin
      .from("seller_profiles")
      .select("max_outstanding_centavos")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("loans")
      .select("ticket_centavos, status")
      .eq("seller_user_id", userId),
  ]);

  return availableFromLoans(profile?.max_outstanding_centavos ?? 0, loans ?? []);
}
