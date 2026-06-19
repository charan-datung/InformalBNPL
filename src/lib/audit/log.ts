import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Unified staff audit log for non-loan actions (profile approvals, config
 * changes, dispute decisions). Loan lifecycle stays in escrow_events. Both are
 * append-only.
 */

export type AuditInput = {
  actorUserId?: string | null;
  action: string;
  entityType:
    | "buyer_profile"
    | "seller_profile"
    | "system_config"
    | "dispute"
    | "user"
    | "loan";
  entityId?: string | null;
  detail?: unknown;
};

/** Write an audit row. Pass the caller's admin client to keep one connection. */
export async function recordAudit(
  client: SupabaseClient,
  input: AuditInput,
): Promise<void> {
  await client.from("audit_log").insert({
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    detail: (input.detail ?? null) as never,
  });
}

export type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail: unknown;
  created_at: string;
  actorName: string | null;
};

/** Most recent audit entries, newest first, with actor names resolved. */
export async function listAuditLog(limit = 100): Promise<AuditRow[]> {
  const admin = createAdminClient();
  const [{ data: rows }, { data: users }] = await Promise.all([
    admin
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
    admin.from("users").select("id, name"),
  ]);

  const names = new Map((users ?? []).map((u) => [u.id, u.name]));
  return (rows ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    detail: r.detail,
    created_at: r.created_at,
    actorName: r.actor_user_id
      ? (names.get(r.actor_user_id) ?? r.actor_user_id)
      : null,
  }));
}
