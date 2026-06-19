import { createAdminClient } from "@/lib/supabase/admin";
import type { LoanStatus } from "@/lib/loans/state-machine";
import type { EscrowEventType } from "@/lib/loans/events";

/**
 * Read helpers for the operator console. The whole surface is staff-gated, so
 * these use the service-role client for simple, RLS-free reads. Names are
 * resolved through a small users map (loans reference users twice — buyer and
 * seller — so a map is simpler than disambiguating embeds).
 */

export type UserLite = { id: string; name: string; contact: string | null };

async function usersMap(): Promise<Map<string, UserLite>> {
  const admin = createAdminClient();
  const { data } = await admin.from("users").select("id, name, contact");
  const map = new Map<string, UserLite>();
  for (const u of data ?? []) map.set(u.id, u as UserLite);
  return map;
}

export type LoanRow = {
  id: string;
  buyer_user_id: string;
  seller_user_id: string;
  ticket_centavos: number;
  tenor_months: number;
  interest_rate_monthly: number;
  merchant_fee_pct: number;
  status: LoanStatus;
  created_at: string;
  updated_at: string;
  buyerName: string;
  sellerName: string;
};

export async function listLoans(): Promise<LoanRow[]> {
  const admin = createAdminClient();
  const [{ data }, users] = await Promise.all([
    admin.from("loans").select("*").order("created_at", { ascending: false }),
    usersMap(),
  ]);
  return (data ?? []).map((l) => ({
    ...(l as Omit<LoanRow, "buyerName" | "sellerName">),
    buyerName: users.get(l.buyer_user_id)?.name ?? l.buyer_user_id,
    sellerName: users.get(l.seller_user_id)?.name ?? l.seller_user_id,
  }));
}

export type EscrowEventRow = {
  id: string;
  event_type: EscrowEventType;
  amount_centavos: number | null;
  note: string | null;
  actor_user_id: string | null;
  created_at: string;
  actorName: string | null;
};

export type RepaymentRow = {
  id: string;
  amount_centavos: number;
  due_date: string;
  paid_at: string | null;
  status: string;
};

export async function getLoanWithEvents(loanId: string): Promise<{
  loan: LoanRow | null;
  events: EscrowEventRow[];
  repayments: RepaymentRow[];
}> {
  const admin = createAdminClient();
  const [{ data: loan }, { data: events }, { data: repayments }, users] =
    await Promise.all([
      admin.from("loans").select("*").eq("id", loanId).maybeSingle(),
      admin
        .from("escrow_events")
        .select("*")
        .eq("loan_id", loanId)
        .order("created_at", { ascending: true }),
      admin
        .from("repayments")
        .select("id, amount_centavos, due_date, paid_at, status")
        .eq("loan_id", loanId)
        .order("due_date", { ascending: true }),
      usersMap(),
    ]);

  if (!loan) return { loan: null, events: [], repayments: [] };

  return {
    loan: {
      ...(loan as Omit<LoanRow, "buyerName" | "sellerName">),
      buyerName: users.get(loan.buyer_user_id)?.name ?? loan.buyer_user_id,
      sellerName: users.get(loan.seller_user_id)?.name ?? loan.seller_user_id,
    },
    events: (events ?? []).map((e) => ({
      ...(e as Omit<EscrowEventRow, "actorName">),
      actorName: e.actor_user_id
        ? (users.get(e.actor_user_id)?.name ?? e.actor_user_id)
        : null,
    })),
    repayments: (repayments ?? []) as RepaymentRow[],
  };
}

export type PendingBuyer = {
  user_id: string;
  underwriting_notes: string | null;
  created_at: string;
  name: string;
  contact: string | null;
};

export async function listPendingBuyers(): Promise<PendingBuyer[]> {
  const admin = createAdminClient();
  const [{ data }, users] = await Promise.all([
    admin
      .from("buyer_profiles")
      .select("user_id, underwriting_notes, created_at")
      .eq("kyc_status", "pending")
      .order("created_at", { ascending: true }),
    usersMap(),
  ]);
  return (data ?? []).map((b) => ({
    ...b,
    name: users.get(b.user_id)?.name ?? b.user_id,
    contact: users.get(b.user_id)?.contact ?? null,
  }));
}

export type PendingSeller = {
  user_id: string;
  social_handle: string | null;
  verification_notes: string | null;
  verification_photo_path: string | null;
  created_at: string;
  name: string;
  contact: string | null;
  photoUrl: string | null;
};

export async function listPendingSellers(): Promise<PendingSeller[]> {
  const admin = createAdminClient();
  const [{ data }, users] = await Promise.all([
    admin
      .from("seller_profiles")
      .select(
        "user_id, social_handle, verification_notes, verification_photo_path, created_at",
      )
      .eq("kyc_status", "pending")
      .order("created_at", { ascending: true }),
    usersMap(),
  ]);

  const rows = data ?? [];
  return Promise.all(
    rows.map(async (s) => {
      let photoUrl: string | null = null;
      if (s.verification_photo_path) {
        const { data: signed } = await admin.storage
          .from("seller-verification")
          .createSignedUrl(s.verification_photo_path, 300);
        photoUrl = signed?.signedUrl ?? null;
      }
      return {
        ...s,
        name: users.get(s.user_id)?.name ?? s.user_id,
        contact: users.get(s.user_id)?.contact ?? null,
        photoUrl,
      };
    }),
  );
}

export type OpenDispute = {
  id: string;
  loan_id: string;
  reason: string;
  evidenceUrl: string | null;
  status: string;
  created_at: string;
  raiserName: string;
  loanStatus: LoanStatus;
  ticket_centavos: number;
};

export async function listOpenDisputes(): Promise<OpenDispute[]> {
  const admin = createAdminClient();
  const [{ data }, users] = await Promise.all([
    admin
      .from("disputes")
      .select("*")
      .in("status", ["open", "under_review"])
      .order("created_at", { ascending: true }),
    usersMap(),
  ]);

  const disputes = data ?? [];
  if (disputes.length === 0) return [];

  const loanIds = [...new Set(disputes.map((d) => d.loan_id))];
  const { data: loans } = await admin
    .from("loans")
    .select("id, status, ticket_centavos")
    .in("id", loanIds);
  const loanMap = new Map((loans ?? []).map((l) => [l.id, l]));

  return Promise.all(
    disputes.map(async (d) => {
      const loan = loanMap.get(d.loan_id);

      // Evidence is stored as a private-bucket path; sign it for viewing.
      // (Tolerate a full URL too, in case one was stored directly.)
      let evidenceUrl: string | null = null;
      if (d.evidence_url) {
        if (d.evidence_url.startsWith("http")) {
          evidenceUrl = d.evidence_url;
        } else {
          const { data: signed } = await admin.storage
            .from("dispute-evidence")
            .createSignedUrl(d.evidence_url, 300);
          evidenceUrl = signed?.signedUrl ?? null;
        }
      }

      return {
        id: d.id,
        loan_id: d.loan_id,
        reason: d.reason,
        evidenceUrl,
        status: d.status,
        created_at: d.created_at,
        raiserName: users.get(d.raised_by_user_id)?.name ?? d.raised_by_user_id,
        loanStatus: (loan?.status as LoanStatus) ?? "booked",
        ticket_centavos: loan?.ticket_centavos ?? 0,
      };
    }),
  );
}

export type OperatorCounts = {
  pendingBuyers: number;
  pendingSellers: number;
  openDisputes: number;
  loans: number;
};

export async function getOperatorCounts(): Promise<OperatorCounts> {
  const admin = createAdminClient();
  const [buyers, sellers, disputes, loans] = await Promise.all([
    admin
      .from("buyer_profiles")
      .select("*", { count: "exact", head: true })
      .eq("kyc_status", "pending"),
    admin
      .from("seller_profiles")
      .select("*", { count: "exact", head: true })
      .eq("kyc_status", "pending"),
    admin
      .from("disputes")
      .select("*", { count: "exact", head: true })
      .in("status", ["open", "under_review"]),
    admin.from("loans").select("*", { count: "exact", head: true }),
  ]);
  return {
    pendingBuyers: buyers.count ?? 0,
    pendingSellers: sellers.count ?? 0,
    openDisputes: disputes.count ?? 0,
    loans: loans.count ?? 0,
  };
}
