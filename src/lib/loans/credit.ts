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

// Loans in these states no longer tie up the line.
const RELEASED_STATUSES = ["settled", "refunded"];

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

  const limitCentavos = profile?.credit_limit_centavos ?? 0;
  const outstandingCentavos = (loans ?? [])
    .filter((l) => !RELEASED_STATUSES.includes(l.status))
    .reduce((sum, l) => sum + l.ticket_centavos, 0);

  return {
    limitCentavos,
    outstandingCentavos,
    availableCentavos: Math.max(0, limitCentavos - outstandingCentavos),
  };
}
