import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Maker-checker seller payouts. A staff "maker" proposes paying a seller their
 * releasable balance; a different "checker" approves (atomic re-check + ledger
 * settlement via the approve_payout RPC) or rejects. No money moves yet — this
 * records the discharged obligation for settlement over real rails later.
 */

export class PayoutError extends Error {}

export type SellerPayable = {
  releasableCentavos: number;
  paidOutCentavos: number;
  availableCentavos: number;
};

async function approvedPaidOut(
  admin: ReturnType<typeof createAdminClient>,
  sellerUserId: string,
): Promise<number> {
  const { data } = await admin
    .from("payouts")
    .select("amount_centavos")
    .eq("seller_user_id", sellerUserId)
    .eq("status", "approved");
  return (data ?? []).reduce((s, p) => s + p.amount_centavos, 0);
}

export async function getSellerPayable(sellerUserId: string): Promise<SellerPayable> {
  const admin = createAdminClient();
  const [{ data: row }, paidOutCentavos] = await Promise.all([
    admin
      .from("seller_releasable_payable")
      .select("releasable_centavos")
      .eq("seller_user_id", sellerUserId)
      .maybeSingle(),
    approvedPaidOut(admin, sellerUserId),
  ]);
  const releasableCentavos = row?.releasable_centavos ?? 0;
  return {
    releasableCentavos,
    paidOutCentavos,
    availableCentavos: Math.max(0, releasableCentavos - paidOutCentavos),
  };
}

export async function proposePayout(input: {
  sellerUserId: string;
  amountCentavos: number;
  makerUserId: string;
  note?: string | null;
}): Promise<{ id: string }> {
  const admin = createAdminClient();
  if (!Number.isInteger(input.amountCentavos) || input.amountCentavos <= 0) {
    throw new PayoutError("Enter a valid payout amount.");
  }
  const { availableCentavos } = await getSellerPayable(input.sellerUserId);
  if (input.amountCentavos > availableCentavos) {
    throw new PayoutError("Amount exceeds the seller's available payable.");
  }
  const { data, error } = await admin
    .from("payouts")
    .insert({
      seller_user_id: input.sellerUserId,
      amount_centavos: input.amountCentavos,
      maker_user_id: input.makerUserId,
      note: input.note?.trim() || null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new PayoutError(error.message);
  return data;
}

/** Approve via the atomic RPC (re-checks availability, posts the ledger leg). */
export async function approvePayout(input: {
  payoutId: string;
  checkerUserId: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("approve_payout", {
    p_payout: input.payoutId,
    p_checker: input.checkerUserId,
  });
  if (error) throw new PayoutError(error.message);
}

export async function rejectPayout(input: {
  payoutId: string;
  checkerUserId: string;
  note?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: payout } = await admin
    .from("payouts")
    .select("maker_user_id, status")
    .eq("id", input.payoutId)
    .maybeSingle();
  if (!payout) throw new PayoutError("Payout not found.");
  if (payout.status !== "proposed") throw new PayoutError("Payout already decided.");
  if (payout.maker_user_id === input.checkerUserId) {
    throw new PayoutError("Maker cannot decide their own payout.");
  }
  const { error } = await admin
    .from("payouts")
    .update({
      status: "rejected",
      checker_user_id: input.checkerUserId,
      decided_at: new Date().toISOString(),
      note: input.note?.trim() || null,
    })
    .eq("id", input.payoutId)
    .eq("status", "proposed");
  if (error) throw new PayoutError(error.message);
}

// ---- Operator console reads ----

export type PayableSeller = {
  sellerUserId: string;
  name: string;
  availableCentavos: number;
};

/** Verified sellers who have a positive available payable, for the maker view. */
export async function listSellersWithPayable(): Promise<PayableSeller[]> {
  const admin = createAdminClient();
  const [{ data: releasable }, { data: approved }, { data: users }] = await Promise.all([
    admin.from("seller_releasable_payable").select("seller_user_id, releasable_centavos"),
    admin.from("payouts").select("seller_user_id, amount_centavos").eq("status", "approved"),
    admin.from("users").select("id, name"),
  ]);

  const paidBySeller = new Map<string, number>();
  for (const p of approved ?? []) {
    paidBySeller.set(p.seller_user_id, (paidBySeller.get(p.seller_user_id) ?? 0) + p.amount_centavos);
  }
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));

  return (releasable ?? [])
    .map((r) => ({
      sellerUserId: r.seller_user_id,
      name: nameById.get(r.seller_user_id) ?? r.seller_user_id,
      availableCentavos: Math.max(0, r.releasable_centavos - (paidBySeller.get(r.seller_user_id) ?? 0)),
    }))
    .filter((s) => s.availableCentavos > 0)
    .sort((a, b) => b.availableCentavos - a.availableCentavos);
}

export type PayoutRow = {
  id: string;
  maker_user_id: string;
  sellerName: string;
  makerName: string;
  checkerName: string | null;
  amount_centavos: number;
  status: string;
  note: string | null;
  created_at: string;
  decided_at: string | null;
};

async function decorate(
  admin: ReturnType<typeof createAdminClient>,
  rows: {
    id: string;
    seller_user_id: string;
    maker_user_id: string;
    checker_user_id: string | null;
    amount_centavos: number;
    status: string;
    note: string | null;
    created_at: string;
    decided_at: string | null;
  }[],
): Promise<PayoutRow[]> {
  const { data: users } = await admin.from("users").select("id, name");
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    maker_user_id: r.maker_user_id,
    sellerName: nameById.get(r.seller_user_id) ?? r.seller_user_id,
    makerName: nameById.get(r.maker_user_id) ?? r.maker_user_id,
    checkerName: r.checker_user_id ? (nameById.get(r.checker_user_id) ?? r.checker_user_id) : null,
    amount_centavos: r.amount_centavos,
    status: r.status,
    note: r.note,
    created_at: r.created_at,
    decided_at: r.decided_at,
  }));
}

export async function listProposedPayouts(): Promise<PayoutRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("payouts")
    .select("*")
    .eq("status", "proposed")
    .order("created_at", { ascending: true });
  return decorate(admin, data ?? []);
}

export async function listRecentPayouts(limit = 15): Promise<PayoutRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("payouts")
    .select("*")
    .neq("status", "proposed")
    .order("decided_at", { ascending: false })
    .limit(limit);
  return decorate(admin, data ?? []);
}
