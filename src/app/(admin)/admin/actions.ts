"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/staff";
import { updateSystemConfig } from "@/lib/config/update";
import { CONFIG_DEFAULTS, type ConfigKey } from "@/lib/config/system-config";
import {
  updateStaffRole,
  createStaffMember,
  type StaffRoleValue,
} from "@/lib/staff/manage";
import { adminOverride } from "@/lib/loans/mutations";
import { isLoanStatus } from "@/lib/loans/state-machine";

/**
 * Admin-only server actions. DATA-LAYER access control: each starts with
 * requireAdmin(), which throws if the caller isn't an admin — so even a direct
 * POST from a non-admin (bypassing the hidden UI) is rejected before any write.
 * Failures redirect back with ?error=…
 */

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
}

export async function updateConfigAction(formData: FormData) {
  const back = "/admin/config";
  const key = String(formData.get("key") ?? "");
  const value = Number(formData.get("value"));

  try {
    const admin = await requireAdmin();
    if (!(key in CONFIG_DEFAULTS)) throw new Error("Unknown config key.");
    await updateSystemConfig({
      key: key as ConfigKey,
      value,
      actorUserId: admin.id,
    });
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(back);
}

export async function updateStaffRoleAction(formData: FormData) {
  const back = "/admin/staff";
  const userId = String(formData.get("userId") ?? "");
  const roleRaw = String(formData.get("role") ?? "");
  const role: StaffRoleValue =
    roleRaw === "operator" || roleRaw === "admin" ? roleRaw : null;

  try {
    const admin = await requireAdmin();
    await updateStaffRole({ userId, role, actorUserId: admin.id });
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(back);
}

export async function addStaffMemberAction(formData: FormData) {
  const back = "/admin/staff";
  const email = String(formData.get("email") ?? "");
  const name = String(formData.get("name") ?? "");
  const password = String(formData.get("password") ?? "");
  const roleRaw = String(formData.get("role") ?? "");
  const role = roleRaw === "admin" ? "admin" : "operator";

  try {
    const admin = await requireAdmin();
    await createStaffMember({ email, name, password, role, actorUserId: admin.id });
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(
    `${back}?ok=${encodeURIComponent(
      `Created ${role} account for ${email.trim().toLowerCase()}. Share the email + temporary password so they can log in.`,
    )}`,
  );
}

export async function adminOverrideAction(formData: FormData) {
  const loanId = String(formData.get("loanId") ?? "");
  const to = String(formData.get("to") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const back = `/admin/loans/${loanId}`;

  try {
    const admin = await requireAdmin();
    if (!isLoanStatus(to)) throw new Error("Unknown target status.");
    if (!reason) throw new Error("A reason is required for an override.");
    await adminOverride({ loanId, to, reason, actorUserId: admin.id });
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(back);
}
