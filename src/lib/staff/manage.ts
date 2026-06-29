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

/**
 * Create a brand-new staff login (admin only). Used to stand up a second
 * operator/admin so maker-checker has two distinct people. Creates the auth user
 * with the email pre-confirmed (they can sign in immediately), relies on the
 * handle_new_user trigger to mirror the public.users row, then stamps the name +
 * staff_role. The admin shares the email + temporary password out-of-band.
 */
export async function createStaffMember(input: {
  email: string;
  name: string;
  password: string;
  role: "operator" | "admin";
  actorUserId: string;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (input.password.length < 8) {
    throw new Error("Temporary password must be at least 8 characters.");
  }
  if (!input.name.trim()) throw new Error("Enter a name.");
  if (input.role !== "operator" && input.role !== "admin") {
    throw new Error("Pick a role.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name.trim() },
  });
  if (error) throw new Error(error.message);
  const newId = data.user?.id;
  if (!newId) throw new Error("Could not create the account.");

  // The on_auth_user_created trigger mirrors the public.users row; upsert is a
  // belt-and-braces in case of timing, and stamps the staff role + name.
  const { error: upErr } = await admin.from("users").upsert(
    { id: newId, name: input.name.trim(), contact: email, staff_role: input.role },
    { onConflict: "id" },
  );
  if (upErr) throw new Error(upErr.message);

  await recordAudit(admin, {
    actorUserId: input.actorUserId,
    action: "staff_member_created",
    entityType: "user",
    entityId: newId,
    detail: { email, role: input.role },
  });
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
