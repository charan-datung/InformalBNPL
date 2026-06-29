import { createAdminClient } from "@/lib/supabase/admin";
import type { LoanStatus } from "@/lib/loans/state-machine";

/**
 * Buyer/seller-facing reads for the active dashboards. Filtered by the session
 * user's id (passed in, derived from the verified session), so the service-role
 * client only ever returns the caller's own loans.
 */

async function namesMap(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const { data } = await admin.from("users").select("id, name");
  return new Map((data ?? []).map((u) => [u.id, u.name]));
}

/** First-occurrence timestamps of key lifecycle events, per loan. */
type KeyDates = {
  shippedAt: string | null;
  deliveredAt: string | null; // delivered_confirmed OR auto_released
  releasedAt: string | null;
};

async function keyEventDates(
  loanIds: string[],
): Promise<Map<string, KeyDates>> {
  const map = new Map<string, KeyDates>();
  if (loanIds.length === 0) return map;

  const admin = createAdminClient();
  const { data } = await admin
    .from("escrow_events")
    .select("loan_id, event_type, created_at")
    .in("loan_id", loanIds)
    .in("event_type", [
      "shipped",
      "delivered_confirmed",
      "auto_released",
      "escrow_released",
    ])
    .order("created_at", { ascending: true });

  for (const e of data ?? []) {
    const d =
      map.get(e.loan_id) ??
      ({ shippedAt: null, deliveredAt: null, releasedAt: null } as KeyDates);
    if (e.event_type === "shipped" && !d.shippedAt) d.shippedAt = e.created_at;
    if (
      (e.event_type === "delivered_confirmed" ||
        e.event_type === "auto_released") &&
      !d.deliveredAt
    )
      d.deliveredAt = e.created_at;
    if (e.event_type === "escrow_released" && !d.releasedAt)
      d.releasedAt = e.created_at;
    map.set(e.loan_id, d);
  }
  return map;
}

export type RepaymentLite = {
  id: string;
  amount_centavos: number;
  principal_centavos: number | null;
  interest_centavos: number | null;
  due_date: string;
  paid_at: string | null;
  status: string;
};

async function repaymentsByLoan(
  loanIds: string[],
): Promise<Map<string, RepaymentLite[]>> {
  const map = new Map<string, RepaymentLite[]>();
  if (loanIds.length === 0) return map;

  const admin = createAdminClient();
  const { data } = await admin
    .from("repayments")
    .select(
      "id, loan_id, amount_centavos, principal_centavos, interest_centavos, due_date, paid_at, status",
    )
    .in("loan_id", loanIds)
    .order("due_date", { ascending: true });

  for (const r of data ?? []) {
    const list = map.get(r.loan_id) ?? [];
    list.push(r as RepaymentLite);
    map.set(r.loan_id, list);
  }
  return map;
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

export async function getBuyerCreditLimit(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("buyer_profiles")
    .select("credit_limit_centavos")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.credit_limit_centavos ?? 0;
}

// ---- Seller dashboard ------------------------------------------------------

export type SellerLoanView = {
  id: string;
  status: LoanStatus;
  ticket_centavos: number;
  tenor_months: number;
  merchant_fee_pct: number;
  feeCentavos: number;
  netCentavos: number;
  buyerName: string;
  created_at: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  releasedAt: string | null;
  /** Set on an in-person order still awaiting the seller's handover-code entry. */
  handoverPending: boolean;
};

export async function listSellerLoans(
  sellerUserId: string,
): Promise<SellerLoanView[]> {
  const admin = createAdminClient();
  const [{ data }, names] = await Promise.all([
    admin
      .from("loans")
      .select(
        "id, status, ticket_centavos, tenor_months, merchant_fee_pct, buyer_user_id, created_at, handover_code, handover_confirmed_at",
      )
      .eq("seller_user_id", sellerUserId)
      .order("created_at", { ascending: false }),
    namesMap(),
  ]);

  const loans = data ?? [];
  const dates = await keyEventDates(loans.map((l) => l.id));

  return loans.map((l) => {
    const fee = Math.round((l.ticket_centavos * l.merchant_fee_pct) / 100);
    const d = dates.get(l.id);
    return {
      id: l.id,
      status: l.status as LoanStatus,
      ticket_centavos: l.ticket_centavos,
      tenor_months: l.tenor_months,
      merchant_fee_pct: l.merchant_fee_pct,
      feeCentavos: fee,
      netCentavos: l.ticket_centavos - fee,
      buyerName: names.get(l.buyer_user_id) ?? l.buyer_user_id,
      created_at: l.created_at,
      shippedAt: d?.shippedAt ?? null,
      deliveredAt: d?.deliveredAt ?? null,
      releasedAt: d?.releasedAt ?? null,
      handoverPending: Boolean(l.handover_code) && !l.handover_confirmed_at,
    };
  });
}

// ---- Buyer dashboard -------------------------------------------------------

export type BuyerLoanView = {
  id: string;
  status: LoanStatus;
  ticket_centavos: number;
  tenor_months: number;
  sellerName: string;
  created_at: string;
  shippedAt: string | null;
  /** In-person handover code to show the seller (null for ship / once confirmed). */
  handoverCode: string | null;
  repayments: RepaymentLite[];
};

export async function listBuyerLoans(
  buyerUserId: string,
): Promise<BuyerLoanView[]> {
  const admin = createAdminClient();
  const [{ data }, names] = await Promise.all([
    admin
      .from("loans")
      .select(
        "id, status, ticket_centavos, tenor_months, seller_user_id, created_at, handover_code, handover_confirmed_at",
      )
      .eq("buyer_user_id", buyerUserId)
      .order("created_at", { ascending: false }),
    namesMap(),
  ]);

  const loans = data ?? [];
  const [dates, reps] = await Promise.all([
    keyEventDates(loans.map((l) => l.id)),
    repaymentsByLoan(loans.map((l) => l.id)),
  ]);

  return loans.map((l) => ({
    id: l.id,
    status: l.status as LoanStatus,
    ticket_centavos: l.ticket_centavos,
    tenor_months: l.tenor_months,
    sellerName: names.get(l.seller_user_id) ?? l.seller_user_id,
    created_at: l.created_at,
    shippedAt: dates.get(l.id)?.shippedAt ?? null,
    // Only relevant while still awaiting handover (in-person, not yet confirmed).
    handoverCode: l.handover_confirmed_at ? null : (l.handover_code ?? null),
    repayments: reps.get(l.id) ?? [],
  }));
}
