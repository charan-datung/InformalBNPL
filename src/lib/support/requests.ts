import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Support requests raised by buyers/sellers from their profile, triaged in the
 * operator console. All access via the service-role client (RLS-locked table).
 */

export type SupportContext = "buyer" | "seller" | "general";

export async function createSupportRequest(input: {
  userId: string;
  context: SupportContext;
  message: string;
  subject?: string | null;
  contact?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("support_requests").insert({
    user_id: input.userId,
    context: input.context,
    message: input.message,
    subject: input.subject?.trim() || null,
    contact: input.contact?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export type SupportRequestRow = {
  id: string;
  context: string;
  subject: string | null;
  message: string;
  contact: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  userName: string | null;
  userContact: string | null;
};

/** Operator view: all requests, open first, with the requester's name/contact. */
export async function listSupportRequests(): Promise<SupportRequestRow[]> {
  const admin = createAdminClient();
  const { data: reqs, error } = await admin
    .from("support_requests")
    .select(
      "id, context, subject, message, contact, status, created_at, resolved_at, user_id",
    )
    .order("created_at", { ascending: false });
  if (error || !reqs) return [];

  const ids = Array.from(new Set(reqs.map((r) => r.user_id)));
  const { data: users } = await admin
    .from("users")
    .select("id, name, contact")
    .in("id", ids);
  const byId = new Map(
    (users ?? []).map((u) => [u.id, { name: u.name, contact: u.contact }]),
  );

  return reqs
    .map((r) => {
      const u = byId.get(r.user_id);
      return {
        id: r.id,
        context: r.context,
        subject: r.subject,
        message: r.message,
        contact: r.contact,
        status: r.status,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        userName: u?.name ?? null,
        userContact: u?.contact ?? null,
      };
    })
    .sort((a, b) =>
      a.status === b.status
        ? a.createdAt < b.createdAt
          ? 1
          : -1
        : a.status === "open"
          ? -1
          : 1,
    );
}

export async function resolveSupportRequest(
  id: string,
  actorUserId: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("support_requests")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: actorUserId,
    })
    .eq("id", id)
    .eq("status", "open");
}

/** Count of open requests, for the operator overview badge. */
export async function countOpenSupportRequests(): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("support_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  return count ?? 0;
}
