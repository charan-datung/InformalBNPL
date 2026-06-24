import { cache } from "react";
import { redirect } from "next/navigation";
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
export const getCurrentStaff = cache(async function getCurrentStaff(): Promise<Staff | null> {
  // Before Supabase is configured, treat as not-logged-in so gated layouts
  // redirect to /login instead of crashing.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabase = await createClient();

  try {
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
  } catch (e) {
    console.error("getCurrentStaff failed:", e);
    return null;
  }
});

/** Require any staff member (operator or admin); throws otherwise. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) {
    throw new Error("Forbidden: staff access required.");
  }
  return staff;
}

/** Require an admin specifically; throws otherwise. (Use in server actions.) */
export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.staff_role !== "admin") {
    throw new Error("Forbidden: admin access required.");
  }
  return staff;
}

/**
 * Page-level admin gate: redirects non-admins away (operators -> their console,
 * everyone else -> login) instead of throwing. Call this as the FIRST await in
 * every admin page/layout so a non-admin's request never reaches the data
 * fetches below it.
 */
export async function requireAdminOrRedirect(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  if (staff.staff_role !== "admin") redirect("/operator");
  return staff;
}
