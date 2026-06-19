import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Full, searchable audit for the admin portal. Merges the two immutable trails:
 *   - escrow_events  (loan lifecycle, incl. dispute_resolved + admin_override)
 *   - audit_log      (profile approvals, config changes, staff/role, overrides)
 *
 * Filters: actor (user), loan, event type / action, and a date range. The loan
 * filter only applies to escrow_events (audit_log rows aren't loan-scoped).
 */

export type AuditFilters = {
  actorUserId?: string;
  loanId?: string;
  eventType?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
};

export type UnifiedAuditRow = {
  key: string;
  source: "loan" | "admin";
  created_at: string;
  actorName: string | null;
  type: string;
  loanId: string | null;
  entityLabel: string | null;
  note: string;
  isOverride: boolean;
};

const LIMIT = 500;

export async function searchAudit(
  f: AuditFilters,
): Promise<UnifiedAuditRow[]> {
  const admin = createAdminClient();
  const { data: users } = await admin.from("users").select("id, name");
  const names = new Map((users ?? []).map((u) => [u.id, u.name]));

  // ---- escrow_events ----
  let eq = admin
    .from("escrow_events")
    .select("id, loan_id, event_type, amount_centavos, note, actor_user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (f.loanId) eq = eq.eq("loan_id", f.loanId);
  if (f.actorUserId) eq = eq.eq("actor_user_id", f.actorUserId);
  if (f.eventType) eq = eq.eq("event_type", f.eventType);
  if (f.dateFrom) eq = eq.gte("created_at", f.dateFrom);
  if (f.dateTo) eq = eq.lte("created_at", `${f.dateTo}T23:59:59`);
  const { data: events } = await eq;

  const loanRows: UnifiedAuditRow[] = (events ?? []).map((e) => ({
    key: `e:${e.id}`,
    source: "loan",
    created_at: e.created_at,
    actorName: e.actor_user_id
      ? (names.get(e.actor_user_id) ?? e.actor_user_id)
      : null,
    type: e.event_type,
    loanId: e.loan_id,
    entityLabel: null,
    note: e.note ?? "",
    isOverride: e.event_type === "admin_override",
  }));

  // ---- audit_log (skip when filtering by a specific loan) ----
  let adminRows: UnifiedAuditRow[] = [];
  if (!f.loanId) {
    let aq = admin
      .from("audit_log")
      .select("id, actor_user_id, action, entity_type, entity_id, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (f.actorUserId) aq = aq.eq("actor_user_id", f.actorUserId);
    if (f.eventType) aq = aq.eq("action", f.eventType);
    if (f.dateFrom) aq = aq.gte("created_at", f.dateFrom);
    if (f.dateTo) aq = aq.lte("created_at", `${f.dateTo}T23:59:59`);
    const { data: logs } = await aq;

    adminRows = (logs ?? []).map((a) => ({
      key: `a:${a.id}`,
      source: "admin",
      created_at: a.created_at,
      actorName: a.actor_user_id
        ? (names.get(a.actor_user_id) ?? a.actor_user_id)
        : null,
      type: a.action,
      loanId: null,
      entityLabel: a.entity_id
        ? `${a.entity_type}:${String(a.entity_id).slice(0, 8)}`
        : a.entity_type,
      note: a.detail ? JSON.stringify(a.detail) : "",
      isOverride: a.action === "admin_override",
    }));
  }

  return [...loanRows, ...adminRows]
    .sort((x, y) => (x.created_at < y.created_at ? 1 : -1))
    .slice(0, LIMIT);
}
