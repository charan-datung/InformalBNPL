import { createAdminClient } from "@/lib/supabase/admin";
import { RELEASED_STATUSES } from "@/lib/loans/credit";
import { isLoanStatus, type LoanStatus } from "@/lib/loans/state-machine";
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
  handover_code: string | null;
  handover_confirmed_at: string | null;
  buyerName: string;
  buyerContact: string | null;
  sellerName: string;
  sellerContact: string | null;
  hasOverride: boolean;
};

/** The non-derived columns of a LoanRow, as read straight from the DB. */
type LoanRowBase = Omit<
  LoanRow,
  "buyerName" | "buyerContact" | "sellerName" | "sellerContact" | "hasOverride"
>;

/** Loan ids that have at least one admin_override event. */
async function overriddenLoanIds(): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("escrow_events")
    .select("loan_id")
    .eq("event_type", "admin_override");
  return new Set((data ?? []).map((r) => r.loan_id));
}

export type LoanFilter = {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export type LoanListPage = {
  rows: LoanRow[];
  total: number;
  limit: number;
  offset: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listLoans(f: LoanFilter = {}): Promise<LoanListPage> {
  const admin = createAdminClient();
  const users = await usersMap();
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const offset = Math.max(f.offset ?? 0, 0);
  const search = f.search?.trim();

  let q = admin.from("loans").select("*", { count: "exact" });

  if (f.status && isLoanStatus(f.status)) q = q.eq("status", f.status);

  if (search) {
    if (UUID_RE.test(search)) {
      q = q.eq("id", search);
    } else {
      // Match the typed text against buyer/seller display names.
      const needle = search.toLowerCase();
      const ids = [...users.values()]
        .filter((u) => u.name?.toLowerCase().includes(needle))
        .map((u) => u.id);
      if (ids.length === 0) {
        return { rows: [], total: 0, limit, offset };
      }
      q = q.or(
        `buyer_user_id.in.(${ids.join(",")}),seller_user_id.in.(${ids.join(",")})`,
      );
    }
  }

  const { data, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const overridden = await overriddenLoanIds();
  const rows = (data ?? []).map((l) => ({
    ...(l as LoanRowBase),
    buyerName: users.get(l.buyer_user_id)?.name ?? l.buyer_user_id,
    buyerContact: users.get(l.buyer_user_id)?.contact ?? null,
    sellerName: users.get(l.seller_user_id)?.name ?? l.seller_user_id,
    sellerContact: users.get(l.seller_user_id)?.contact ?? null,
    hasOverride: overridden.has(l.id),
  }));
  return { rows, total: count ?? rows.length, limit, offset };
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
      ...(loan as LoanRowBase),
      buyerName: users.get(loan.buyer_user_id)?.name ?? loan.buyer_user_id,
      buyerContact: users.get(loan.buyer_user_id)?.contact ?? null,
      sellerName: users.get(loan.seller_user_id)?.name ?? loan.seller_user_id,
      sellerContact: users.get(loan.seller_user_id)?.contact ?? null,
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
  proofUrl: string | null;
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
      const app = (b.application as Record<string, unknown> | null) ?? null;
      const sign = async (path: string | null | undefined) => {
        if (!path) return null;
        const { data: signed } = await admin.storage
          .from("buyer-id")
          .createSignedUrl(path, 300);
        return signed?.signedUrl ?? null;
      };
      const [idPhotoUrl, proofUrl] = await Promise.all([
        sign(b.id_document_path),
        sign(app?.proof_of_billing_path as string | undefined),
      ]);
      return {
        user_id: b.user_id,
        created_at: b.created_at,
        name: users.get(b.user_id)?.name ?? b.user_id,
        contact: users.get(b.user_id)?.contact ?? null,
        buyer_kind: b.buyer_kind,
        requested_amount_centavos: b.requested_amount_centavos,
        application: app,
        idPhotoUrl,
        proofUrl,
      };
    }),
  );
}

export type PendingSeller = {
  user_id: string;
  social_handle: string | null;
  marketplace_url: string | null;
  selling_since: string | null;
  id_type: string | null;
  storefront_location: string | null;
  storefront_lat: number | null;
  storefront_lng: number | null;
  verification_notes: string | null;
  created_at: string;
  name: string;
  contact: string | null;
  /** Live item photo (proof of selling). */
  photoUrl: string | null;
  /** Government ID photo. */
  idUrl: string | null;
  /** Storefront / stall photo. */
  storefrontUrl: string | null;
  /** OCR text extracted from the ID / storefront photo (operator-triggered). */
  ocrIdText: string | null;
  ocrStorefrontText: string | null;
};

export async function listPendingSellers(): Promise<PendingSeller[]> {
  const admin = createAdminClient();
  const [{ data }, users] = await Promise.all([
    admin
      .from("seller_profiles")
      .select(
        "user_id, social_handle, marketplace_url, selling_since, id_type, id_document_path, storefront_photo_path, storefront_location, storefront_lat, storefront_lng, verification_notes, verification_photo_path, ocr_id_text, ocr_storefront_text, created_at",
      )
      .eq("kyc_status", "pending")
      .order("created_at", { ascending: true }),
    usersMap(),
  ]);

  const sign = async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    const { data: signed } = await admin.storage
      .from("seller-verification")
      .createSignedUrl(path, 300);
    return signed?.signedUrl ?? null;
  };

  const rows = data ?? [];
  return Promise.all(
    rows.map(async (s) => {
      const [photoUrl, idUrl, storefrontUrl] = await Promise.all([
        sign(s.verification_photo_path),
        sign(s.id_document_path),
        sign(s.storefront_photo_path),
      ]);
      return {
        user_id: s.user_id,
        social_handle: s.social_handle,
        marketplace_url: s.marketplace_url,
        selling_since: s.selling_since,
        id_type: s.id_type,
        storefront_location: s.storefront_location,
        storefront_lat: s.storefront_lat,
        storefront_lng: s.storefront_lng,
        verification_notes: s.verification_notes,
        created_at: s.created_at,
        name: users.get(s.user_id)?.name ?? s.user_id,
        contact: users.get(s.user_id)?.contact ?? null,
        photoUrl,
        idUrl,
        storefrontUrl,
        ocrIdText: s.ocr_id_text ?? null,
        ocrStorefrontText: s.ocr_storefront_text ?? null,
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
  approvedBuyers: number;
  approvedSellers: number;
  openDisputes: number;
  loans: number;
};

export async function getOperatorCounts(): Promise<OperatorCounts> {
  const admin = createAdminClient();
  const countBy = (table: string, column: string, value: string) =>
    admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, value);
  const [buyers, sellers, approvedBuyers, approvedSellers, disputes, loans] =
    await Promise.all([
      countBy("buyer_profiles", "kyc_status", "pending"),
      countBy("seller_profiles", "kyc_status", "pending"),
      countBy("buyer_profiles", "kyc_status", "verified"),
      countBy("seller_profiles", "kyc_status", "verified"),
      admin
        .from("disputes")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "under_review"]),
      admin.from("loans").select("*", { count: "exact", head: true }),
    ]);
  return {
    pendingBuyers: buyers.count ?? 0,
    pendingSellers: sellers.count ?? 0,
    approvedBuyers: approvedBuyers.count ?? 0,
    approvedSellers: approvedSellers.count ?? 0,
    openDisputes: disputes.count ?? 0,
    loans: loans.count ?? 0,
  };
}

/**
 * Record an operator's manual receipt check (did the buyer actually receive the
 * item?) as a `note` on the loan's append-only audit log. Used before releasing
 * escrow when ops phones/messages the buyer to verify, so there's a trail.
 */
export async function recordReceiptCheck(input: {
  loanId: string;
  received: "yes" | "no";
  notes: string | null;
  actorUserId: string;
}): Promise<void> {
  const admin = createAdminClient();
  const verdict =
    input.received === "yes"
      ? "Buyer confirmed receipt"
      : "Buyer did NOT confirm receipt";
  const { error } = await admin.from("escrow_events").insert({
    loan_id: input.loanId,
    event_type: "note",
    note: `Receipt check — ${verdict}.${input.notes ? ` ${input.notes}` : ""}`,
    actor_user_id: input.actorUserId,
  });
  if (error) throw new Error(error.message);
}

// ---- Dispute window / auto-release queue -----------------------------------

export type ReleaseItem = {
  id: string;
  buyerName: string;
  buyerContact: string | null;
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
      buyerContact: users.get(l.buyer_user_id)?.contact ?? null,
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

// ---- Approved member directories ----

/** A loan row reduced to what the exposure/activity rollups need. */
type LoanLite = {
  buyer_user_id: string;
  seller_user_id: string;
  ticket_centavos: number;
  status: string;
};

/** Sum of unsettled ticket exposure + total loan count, keyed by a user id. */
function rollupExposure(
  loans: LoanLite[],
  key: "buyer_user_id" | "seller_user_id",
) {
  const map = new Map<string, { outstanding: number; total: number }>();
  for (const l of loans) {
    const id = l[key];
    const agg = map.get(id) ?? { outstanding: 0, total: 0 };
    agg.total += 1;
    if (!RELEASED_STATUSES.includes(l.status)) agg.outstanding += l.ticket_centavos;
    map.set(id, agg);
  }
  return map;
}

export type ApprovedBuyer = {
  user_id: string;
  name: string;
  contact: string | null;
  buyer_kind: string | null;
  approved_at: string;
  credit_limit_centavos: number;
  outstanding_centavos: number;
  available_centavos: number;
  loan_count: number;
};

export async function listApprovedBuyers(): Promise<ApprovedBuyer[]> {
  const admin = createAdminClient();
  const [{ data }, users, { data: loans }] = await Promise.all([
    admin
      .from("buyer_profiles")
      .select("user_id, created_at, buyer_kind, credit_limit_centavos")
      .eq("kyc_status", "verified")
      .order("created_at", { ascending: false }),
    usersMap(),
    admin.from("loans").select("buyer_user_id, ticket_centavos, status"),
  ]);

  const exposure = rollupExposure((loans ?? []) as LoanLite[], "buyer_user_id");

  return (data ?? []).map((b) => {
    const agg = exposure.get(b.user_id) ?? { outstanding: 0, total: 0 };
    const limit = b.credit_limit_centavos ?? 0;
    return {
      user_id: b.user_id,
      name: users.get(b.user_id)?.name ?? b.user_id,
      contact: users.get(b.user_id)?.contact ?? null,
      buyer_kind: b.buyer_kind,
      approved_at: b.created_at,
      credit_limit_centavos: limit,
      outstanding_centavos: agg.outstanding,
      available_centavos: Math.max(0, limit - agg.outstanding),
      loan_count: agg.total,
    };
  });
}

export type ApprovedSeller = {
  user_id: string;
  name: string;
  contact: string | null;
  social_handle: string | null;
  marketplace_url: string | null;
  selling_since: string | null;
  storefront_location: string | null;
  trust_tier: string;
  rolling_reserve_pct: number;
  max_outstanding_centavos: number;
  outstanding_centavos: number;
  available_centavos: number;
  approved_at: string;
  loan_count: number;
};

export async function listApprovedSellers(): Promise<ApprovedSeller[]> {
  const admin = createAdminClient();
  const [{ data }, users, { data: loans }] = await Promise.all([
    admin
      .from("seller_profiles")
      .select(
        "user_id, created_at, social_handle, marketplace_url, selling_since, storefront_location, trust_tier, rolling_reserve_pct, max_outstanding_centavos",
      )
      .eq("kyc_status", "verified")
      .order("created_at", { ascending: false }),
    usersMap(),
    admin.from("loans").select("seller_user_id, ticket_centavos, status"),
  ]);

  const exposure = rollupExposure((loans ?? []) as LoanLite[], "seller_user_id");

  return (data ?? []).map((s) => {
    const agg = exposure.get(s.user_id) ?? { outstanding: 0, total: 0 };
    const cap = s.max_outstanding_centavos ?? 0;
    return {
      user_id: s.user_id,
      name: users.get(s.user_id)?.name ?? s.user_id,
      contact: users.get(s.user_id)?.contact ?? null,
      social_handle: s.social_handle,
      marketplace_url: s.marketplace_url,
      selling_since: s.selling_since,
      storefront_location: s.storefront_location,
      trust_tier: s.trust_tier,
      rolling_reserve_pct: Number(s.rolling_reserve_pct ?? 0),
      max_outstanding_centavos: cap,
      outstanding_centavos: agg.outstanding,
      available_centavos: Math.max(0, cap - agg.outstanding),
      approved_at: s.created_at,
      loan_count: agg.total,
    };
  });
}
