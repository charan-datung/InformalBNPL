import { createClient } from "@/lib/supabase/server";

/**
 * Staff identity helpers for gating the operator and admin surfaces.
 *
 * These use the cookie-based server client (the logged-in user's session) and
 * read the user's own row from public.users, which RLS allows. staff_role null
 * means a normal user (not staff).
 */

export type StaffRole = "operator" | "admin";
export type Staff = { id: string; name: string; staff_role: StaffRole };

/** The current logged-in staff member, or null if not logged in / not staff. */
export async function getCurrentStaff(): Promise<Staff | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, name, staff_role")
    .eq("id", user.id)
    .maybeSingle();

  if (!data || !data.staff_role) return null;
  return data as Staff;
}

/** Require any staff member (operator or admin); throws otherwise. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) {
    throw new Error("Forbidden: staff access required.");
  }
  return staff;
}

/** Require an admin specifically; throws otherwise. */
export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.staff_role !== "admin") {
    throw new Error("Forbidden: admin access required.");
  }
  return staff;
}
