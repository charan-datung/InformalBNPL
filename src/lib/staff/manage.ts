import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit/log";

/**
 * Staff management (admin only — gated in the action layer). View all users and
 * change staff_role. Role changes are audit-logged with from/to, and an admin
 * cannot change their own role (lockout protection).
 */

export type StaffRoleValue = "operator" | "admin" | null;

export type UserRow = {
  id: string;
  name: string;
  contact: string | null;
  staff_role: StaffRoleValue;
  created_at: string;
  isBuyer: boolean;
  isSeller: boolean;
};

export async function listAllUsers(): Promise<UserRow[]> {
  const admin = createAdminClient();
  const [{ data: users }, { data: buyers }, { data: sellers }] =
    await Promise.all([
      admin
        .from("users")
        .select("id, name, contact, staff_role, created_at")
        .order("created_at", { ascending: true }),
      admin.from("buyer_profiles").select("user_id"),
      admin.from("seller_profiles").select("user_id"),
    ]);

  const buyerIds = new Set((buyers ?? []).map((b) => b.user_id));
  const sellerIds = new Set((sellers ?? []).map((s) => s.user_id));

  return (users ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    contact: u.contact,
    staff_role: u.staff_role as StaffRoleValue,
    created_at: u.created_at,
    isBuyer: buyerIds.has(u.id),
    isSeller: sellerIds.has(u.id),
  }));
}

export async function updateStaffRole(input: {
  userId: string;
  role: StaffRoleValue;
  actorUserId: string;
}): Promise<void> {
  if (input.userId === input.actorUserId) {
    throw new Error("You cannot change your own role.");
  }
  if (input.role !== null && input.role !== "operator" && input.role !== "admin") {
    throw new Error("Invalid role.");
  }

  const admin = createAdminClient();
  const { data: old } = await admin
    .from("users")
    .select("staff_role")
    .eq("id", input.userId)
    .maybeSingle();

  const { error } = await admin
    .from("users")
    .update({ staff_role: input.role })
    .eq("id", input.userId);
  if (error) throw new Error(error.message);

  await recordAudit(admin, {
    actorUserId: input.actorUserId,
    action: "staff_role_changed",
    entityType: "user",
    entityId: input.userId,
    detail: { from: old?.staff_role ?? null, to: input.role },
  });
}
