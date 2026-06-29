import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfig } from "@/lib/config/system-config";
import { installmentPenaltyCentavos } from "@/lib/loans/finance";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import {
  paymentDueSoonBuyerEmail,
  paymentOverdueBuyerEmail,
} from "@/lib/email/templates";

/**
 * Daily payment-reminder run. Finds unpaid installments that are coming up or
 * overdue and emails the buyer — at most one 'upcoming' and one 'overdue' per
 * installment (deduped via repayment_reminders). Pure server-side; invoked by
 * the cron route. Best-effort per installment so one failure never stops the run.
 */

export type ReminderResult = {
  upcoming: number;
  overdue: number;
  skipped: number;
  emailConfigured: boolean;
};

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Loan statuses where chasing a payment makes sense. */
const ACTIVE = new Set(["escrow_released", "repaying"]);

export async function runPaymentReminders(): Promise<ReminderResult> {
  const result: ReminderResult = {
    upcoming: 0,
    overdue: 0,
    skipped: 0,
    emailConfigured: emailConfigured(),
  };
  if (!result.emailConfigured) return result;

  const admin = createAdminClient();
  const config = await getConfig(admin);
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = addDaysIso(today, config.reminder_days_before);

  // Unpaid installments due on/before the upcoming cutoff (covers overdue too).
  const { data: reps } = await admin
    .from("repayments")
    .select("id, loan_id, amount_centavos, due_date, status")
    .in("status", ["pending", "late"])
    .lte("due_date", cutoff)
    .order("due_date", { ascending: true });

  const rows = reps ?? [];
  if (rows.length === 0) return result;

  // Owning loan + buyer for each installment; skip non-active loans.
  const loanIds = [...new Set(rows.map((r) => r.loan_id))];
  const { data: loans } = await admin
    .from("loans")
    .select("id, buyer_user_id, seller_user_id, status")
    .in("id", loanIds);
  const loanById = new Map((loans ?? []).map((l) => [l.id, l]));

  // Seller display names for nicer copy.
  const { data: users } = await admin.from("users").select("id, name");
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name as string]));

  // Already-sent reminders for these installments (dedup).
  const { data: sent } = await admin
    .from("repayment_reminders")
    .select("repayment_id, kind")
    .in(
      "repayment_id",
      rows.map((r) => r.id),
    );
  const alreadySent = new Set((sent ?? []).map((s) => `${s.repayment_id}:${s.kind}`));

  // Cache buyer email lookups across that buyer's installments.
  const emailCache = new Map<string, string | null>();
  async function buyerEmail(userId: string): Promise<string | null> {
    if (emailCache.has(userId)) return emailCache.get(userId)!;
    const { data } = await admin.auth.admin.getUserById(userId);
    const email = data?.user?.email ?? null;
    emailCache.set(userId, email);
    return email;
  }

  for (const r of rows) {
    const loan = loanById.get(r.loan_id);
    if (!loan || !ACTIVE.has(loan.status)) {
      result.skipped++;
      continue;
    }

    const overdue = r.due_date < today;
    const kind = overdue ? "overdue" : "upcoming";
    if (alreadySent.has(`${r.id}:${kind}`)) {
      result.skipped++;
      continue;
    }

    const email = await buyerEmail(loan.buyer_user_id);
    if (!email) {
      result.skipped++;
      continue;
    }

    const buyerName = nameById.get(loan.buyer_user_id) ?? null;
    const sellerName = nameById.get(loan.seller_user_id) ?? null;

    try {
      if (overdue) {
        const penalty = installmentPenaltyCentavos({
          amountCentavos: r.amount_centavos,
          dueDate: r.due_date,
          todayIso: today,
          penaltyRateMonthly: config.penalty_rate_monthly,
        });
        const m = paymentOverdueBuyerEmail({
          buyerName,
          amountCentavos: r.amount_centavos,
          penaltyCentavos: penalty,
          dueDate: r.due_date,
        });
        const res = await sendEmail({ to: email, ...m });
        if (!res.ok) {
          result.skipped++;
          continue;
        }
        result.overdue++;
      } else {
        const m = paymentDueSoonBuyerEmail({
          buyerName,
          amountCentavos: r.amount_centavos,
          dueDate: r.due_date,
          daysUntil: daysBetween(today, r.due_date),
          sellerName,
        });
        const res = await sendEmail({ to: email, ...m });
        if (!res.ok) {
          result.skipped++;
          continue;
        }
        result.upcoming++;
      }
      // Record so we never re-send this kind for this installment.
      await admin
        .from("repayment_reminders")
        .insert({ repayment_id: r.id, kind });
    } catch (e) {
      console.error("payment reminder failed for repayment", r.id, e);
      result.skipped++;
    }
  }

  return result;
}
