import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfig } from "@/lib/config/system-config";
import { installmentPenaltyCentavos } from "@/lib/loans/finance";

/**
 * Collections worklist: every overdue installment on an active loan, with the
 * buyer's contact and accrued penalty, sorted most-overdue first — so the
 * operator knows who to chase today.
 */

export type CollectionItem = {
  loanId: string;
  repaymentId: string;
  buyerName: string;
  buyerContact: string | null;
  amountCentavos: number;
  penaltyCentavos: number;
  dueDate: string;
  daysLate: number;
};

const ACTIVE = ["escrow_released", "repaying"];

export async function listCollections(): Promise<{
  items: CollectionItem[];
  totalOverdueCentavos: number;
}> {
  const admin = createAdminClient();
  const config = await getConfig(admin);
  const today = new Date().toISOString().slice(0, 10);

  const { data: reps } = await admin
    .from("repayments")
    .select("id, loan_id, amount_centavos, paid_centavos, due_date, status")
    .in("status", ["pending", "late"])
    .lt("due_date", today)
    .order("due_date", { ascending: true });
  const rows = reps ?? [];
  if (rows.length === 0) return { items: [], totalOverdueCentavos: 0 };

  const loanIds = [...new Set(rows.map((r) => r.loan_id))];
  const [{ data: loans }, { data: users }] = await Promise.all([
    admin.from("loans").select("id, buyer_user_id, status").in("id", loanIds),
    admin.from("users").select("id, name, contact"),
  ]);
  const loanById = new Map((loans ?? []).map((l) => [l.id, l]));
  const userById = new Map((users ?? []).map((u) => [u.id, u]));

  const items: CollectionItem[] = [];
  for (const r of rows) {
    const loan = loanById.get(r.loan_id);
    if (!loan || !ACTIVE.includes(loan.status)) continue;
    const outstanding = r.amount_centavos - (r.paid_centavos ?? 0);
    if (outstanding <= 0) continue;
    const daysLate = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${r.due_date}T00:00:00Z`)) /
        86_400_000,
    );
    const penalty = installmentPenaltyCentavos({
      amountCentavos: outstanding,
      dueDate: r.due_date,
      todayIso: today,
      penaltyRateMonthly: config.penalty_rate_monthly,
    });
    const u = userById.get(loan.buyer_user_id);
    items.push({
      loanId: r.loan_id,
      repaymentId: r.id,
      buyerName: u?.name ?? loan.buyer_user_id,
      buyerContact: u?.contact ?? null,
      amountCentavos: outstanding,
      penaltyCentavos: penalty,
      dueDate: r.due_date,
      daysLate,
    });
  }
  items.sort((a, b) => b.daysLate - a.daysLate || b.amountCentavos - a.amountCentavos);
  const totalOverdueCentavos = items.reduce(
    (s, i) => s + i.amountCentavos + i.penaltyCentavos,
    0,
  );
  return { items, totalOverdueCentavos };
}
