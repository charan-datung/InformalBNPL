import { createAdminClient } from "@/lib/supabase/admin";
import type { LoanStatus } from "@/lib/loans/state-machine";
import type { EscrowEventType } from "@/lib/loans/events";
import { getConfig } from "@/lib/config/system-config";
import { disputeWindow } from "@/lib/loans/window";

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
  shipment_proof_path: string | null;
  buyerName: string;
  sellerName: string;
  hasOverride: boolean;
};

/** Loan ids that have at least one admin_override event. */
async function overriddenLoanIds(): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("escrow_events")
    .select("loan_id")
    .eq("event_type", "admin_override");
  return new Set((data ?? []).map((r) => r.loan_id));
}

export async function listLoans(): Promise<LoanRow[]> {
  const admin = createAdminClient();
  const [{ data }, users, overridden] = await Promise.all([
    admin.from("loans").select("*").order("created_at", { ascending: false }),
    usersMap(),
    overriddenLoanIds(),
  ]);
  return (data ?? []).map((l) => ({
    ...(l as Omit<LoanRow, "buyerName" | "sellerName" | "hasOverride">),
    buyerName: users.get(l.buyer_user_id)?.name ?? l.buyer_user_id,
    sellerName: users.get(l.seller_user_id)?.name ?? l.seller_user_id,
    hasOverride: overridden.has(l.id),
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
  shipmentProofUrl: string | null;
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

  if (!loan)
    return { loan: null, events: [], repayments: [], shipmentProofUrl: null };

  let shipmentProofUrl: string | null = null;
  if (loan.shipment_proof_path) {
    const { data: signed } = await admin.storage
      .from("shipment-proof")
      .createSignedUrl(loan.shipment_proof_path, 300);
    shipmentProofUrl = signed?.signedUrl ?? null;
  }

  const hasOverride = (events ?? []).some(
    (e) => e.event_type === "admin_override",
  );

  return {
    shipmentProofUrl,
    loan: {
      ...(loan as Omit<LoanRow, "buyerName" | "sellerName" | "hasOverride">),
      buyerName: users.get(loan.buyer_user_id)?.name ?? loan.buyer_user_id,
      sellerName: users.get(loan.seller_user_id)?.name ?? loan.seller_user_id,
      hasOverride,
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
  created_at: string;
  name: string;
  contact: string | null;
  buyer_kind: string | null;
  requested_amount_centavos: number | null;
  application: Record<string, unknown> | null;
  idPhotoUrl: string | null;
};

export async function listPendingBuyers(): Promise<PendingBuyer[]> {
  const admin = createAdminClient();
  const [{ data }, users] = await Promise.all([
    admin
      .from("buyer_profiles")
      .select(
        "user_id, created_at, buyer_kind, requested_amount_centavos, application, id_document_path",
      )
      .eq("kyc_status", "pending")
      .order("created_at", { ascending: true }),
    usersMap(),
  ]);

  return Promise.all(
    (data ?? []).map(async (b) => {
      let idPhotoUrl: string | null = null;
      if (b.id_document_path) {
        const { data: signed } = await admin.storage
          .from("buyer-id")
          .createSignedUrl(b.id_document_path, 300);
        idPhotoUrl = signed?.signedUrl ?? null;
      }
      return {
        user_id: b.user_id,
        created_at: b.created_at,
        name: users.get(b.user_id)?.name ?? b.user_id,
        contact: users.get(b.user_id)?.contact ?? null,
        buyer_kind: b.buyer_kind,
        requested_amount_centavos: b.requested_amount_centavos,
        application: (b.application as Record<string, unknown> | null) ?? null,
        idPhotoUrl,
      };
    }),
  );
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

// ---- Dispute window / auto-release queue -----------------------------------

export type ReleaseItem = {
  id: string;
  buyerName: string;
  sellerName: string;
  ticket_centavos: number;
  feeCentavos: number;
  netCentavos: number;
  status: LoanStatus;
  shippedAt: string | null;
  windowEndsAt: string | null;
  daysLeft: number;
};

export type ReleaseQueue = {
  /** delivered_confirmed / auto_released — ready for the operator to release. */
  toRelease: ReleaseItem[];
  /** shipped + window elapsed — clear (no dispute) before releasing. */
  toClear: ReleaseItem[];
  /** shipped + still within the dispute window — waiting. */
  waiting: ReleaseItem[];
};

/**
 * Build the release queue by computing each in-flight loan's dispute window on
 * the fly (no cron). Loans in dispute sit in `dispute_raised` and so never
 * appear here — a dispute freezes the release.
 */
export async function listReleaseQueue(): Promise<ReleaseQueue> {
  const admin = createAdminClient();
  const [{ data: loans }, users, config] = await Promise.all([
    admin
      .from("loans")
      .select("id, status, ticket_centavos, merchant_fee_pct, buyer_user_id, seller_user_id")
      .in("status", ["shipped", "delivered_confirmed", "auto_released"])
      .order("created_at", { ascending: true }),
    usersMap(),
    getConfig(),
  ]);

  const rows = loans ?? [];
  const ids = rows.map((l) => l.id);

  // First `shipped` timestamp per loan (when the window started).
  const shippedAt = new Map<string, string>();
  if (ids.length > 0) {
    const { data: se } = await admin
      .from("escrow_events")
      .select("loan_id, created_at")
      .eq("event_type", "shipped")
      .in("loan_id", ids)
      .order("created_at", { ascending: true });
    for (const e of se ?? []) {
      if (!shippedAt.has(e.loan_id)) shippedAt.set(e.loan_id, e.created_at);
    }
  }

  const queue: ReleaseQueue = { toRelease: [], toClear: [], waiting: [] };

  for (const l of rows) {
    const fee = Math.round((l.ticket_centavos * l.merchant_fee_pct) / 100);
    const shipped = shippedAt.get(l.id) ?? null;
    const win = disputeWindow(shipped, config.dispute_window_days);
    const item: ReleaseItem = {
      id: l.id,
      buyerName: users.get(l.buyer_user_id)?.name ?? l.buyer_user_id,
      sellerName: users.get(l.seller_user_id)?.name ?? l.seller_user_id,
      ticket_centavos: l.ticket_centavos,
      feeCentavos: fee,
      netCentavos: l.ticket_centavos - fee,
      status: l.status as LoanStatus,
      shippedAt: shipped,
      windowEndsAt: win.applicable ? win.endsAt.toISOString() : null,
      daysLeft: win.applicable ? win.daysLeft : 0,
    };

    if (l.status === "delivered_confirmed" || l.status === "auto_released") {
      queue.toRelease.push(item);
    } else if (win.applicable && win.elapsed) {
      queue.toClear.push(item);
    } else {
      queue.waiting.push(item);
    }
  }

  return queue;
}
