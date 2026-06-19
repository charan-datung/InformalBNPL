import { createAdminClient } from "@/lib/supabase/admin";
import type { LoanStatus } from "@/lib/loans/state-machine";

/**
 * Buyer/seller-facing reads for the dashboard. Filtered by the session user's
 * id (passed in, derived from the verified session), so the service-role client
 * only ever returns the caller's own loans. Verified sellers expose just the
 * minimal fields a buyer needs to choose one.
 */

async function namesMap(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const { data } = await admin.from("users").select("id, name");
  return new Map((data ?? []).map((u) => [u.id, u.name]));
}

export type VerifiedSeller = {
  userId: string;
  name: string;
  socialHandle: string | null;
};

export async function listVerifiedSellers(): Promise<VerifiedSeller[]> {
  const admin = createAdminClient();
  const [{ data }, names] = await Promise.all([
    admin
      .from("seller_profiles")
      .select("user_id, social_handle")
      .eq("kyc_status", "verified")
      .not("activated_at", "is", null),
    namesMap(),
  ]);
  return (data ?? []).map((s) => ({
    userId: s.user_id,
    name: names.get(s.user_id) ?? s.user_id,
    socialHandle: s.social_handle,
  }));
}

export type DashboardLoan = {
  id: string;
  status: LoanStatus;
  ticket_centavos: number;
  tenor_months: number;
  counterpartyName: string;
  created_at: string;
};

/** Loans where the user is the buyer. counterparty = seller. */
export async function listBuyerLoans(
  buyerUserId: string,
): Promise<DashboardLoan[]> {
  const admin = createAdminClient();
  const [{ data }, names] = await Promise.all([
    admin
      .from("loans")
      .select("id, status, ticket_centavos, tenor_months, seller_user_id, created_at")
      .eq("buyer_user_id", buyerUserId)
      .order("created_at", { ascending: false }),
    namesMap(),
  ]);
  return (data ?? []).map((l) => ({
    id: l.id,
    status: l.status as LoanStatus,
    ticket_centavos: l.ticket_centavos,
    tenor_months: l.tenor_months,
    counterpartyName: names.get(l.seller_user_id) ?? l.seller_user_id,
    created_at: l.created_at,
  }));
}

/** Loans where the user is the seller. counterparty = buyer. */
export async function listSellerLoans(
  sellerUserId: string,
): Promise<DashboardLoan[]> {
  const admin = createAdminClient();
  const [{ data }, names] = await Promise.all([
    admin
      .from("loans")
      .select("id, status, ticket_centavos, tenor_months, buyer_user_id, created_at")
      .eq("seller_user_id", sellerUserId)
      .order("created_at", { ascending: false }),
    namesMap(),
  ]);
  return (data ?? []).map((l) => ({
    id: l.id,
    status: l.status as LoanStatus,
    ticket_centavos: l.ticket_centavos,
    tenor_months: l.tenor_months,
    counterpartyName: names.get(l.buyer_user_id) ?? l.buyer_user_id,
    created_at: l.created_at,
  }));
}
