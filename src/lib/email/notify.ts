import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send";
import { approvalEmail } from "@/lib/email/templates";

/**
 * Email a buyer/seller that their application was approved. Best-effort: looks up
 * the auth email + display name via the service-role client and sends; any
 * failure is logged and swallowed so it never blocks the approval.
 */
export async function sendApprovalEmail(
  admin: SupabaseClient,
  userId: string,
  capability: "buyer" | "seller",
): Promise<void> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    if (error || !email) return;
    const { data: u } = await admin
      .from("users")
      .select("name")
      .eq("id", userId)
      .maybeSingle();
    const { subject, html } = approvalEmail({ name: u?.name ?? null, capability });
    await sendEmail({ to: email, subject, html });
  } catch (e) {
    console.error("sendApprovalEmail failed:", e);
  }
}
