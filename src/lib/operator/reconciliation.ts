import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reconciliation helpers. Two views the operator needs to trust the money:
 *   1. A tape of confirmed payments (reference + amount) to tick against the
 *      actual GCash/Maya/bank statement.
 *   2. A ledger trial balance — sum of debits must equal sum of credits — to
 *      catch any drift in the double-entry book.
 */

export type ConfirmedPayment = {
  id: string;
  amount_centavos: number;
  reference_no: string | null;
  method: string | null;
  confirmed_at: string | null;
  created_at: string;
  buyerName: string;
  loan_id: string;
};

export async function listConfirmedPayments(
  days = 30,
): Promise<{ rows: ConfirmedPayment[]; totalCentavos: number }> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data: pays }, { data: users }] = await Promise.all([
    admin
      .from("payments")
      .select("id, loan_id, amount_centavos, reference_no, method, confirmed_at, created_at")
      .eq("status", "confirmed")
      .gte("created_at", since)
      .order("confirmed_at", { ascending: false }),
    admin.from("users").select("id, name"),
  ]);
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name as string]));

  const loanIds = [...new Set((pays ?? []).map((p) => p.loan_id))];
  const buyerByLoan = new Map<string, string>();
  if (loanIds.length > 0) {
    const { data: loans } = await admin
      .from("loans")
      .select("id, buyer_user_id")
      .in("id", loanIds);
    for (const l of loans ?? []) buyerByLoan.set(l.id, l.buyer_user_id);
  }

  const rows = (pays ?? []).map((p) => ({
    id: p.id,
    amount_centavos: p.amount_centavos,
    reference_no: p.reference_no,
    method: p.method,
    confirmed_at: p.confirmed_at,
    created_at: p.created_at,
    loan_id: p.loan_id,
    buyerName: nameById.get(buyerByLoan.get(p.loan_id) ?? "") ?? "—",
  }));
  const totalCentavos = rows.reduce((s, r) => s + r.amount_centavos, 0);
  return { rows, totalCentavos };
}

export type TrialBalanceRow = {
  account: string;
  debit: number;
  credit: number;
  net: number; // credit − debit
};

export async function ledgerTrialBalance(): Promise<{
  accounts: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}> {
  const admin = createAdminClient();
  // Pilot scale: aggregate in app. (Swap for an RPC/materialized view at volume.)
  const { data } = await admin
    .from("ledger_entries")
    .select("account, direction, amount_centavos");
  const byAccount = new Map<string, { debit: number; credit: number }>();
  let totalDebit = 0;
  let totalCredit = 0;
  for (const e of data ?? []) {
    const a = byAccount.get(e.account) ?? { debit: 0, credit: 0 };
    if (e.direction === "debit") {
      a.debit += e.amount_centavos;
      totalDebit += e.amount_centavos;
    } else {
      a.credit += e.amount_centavos;
      totalCredit += e.amount_centavos;
    }
    byAccount.set(e.account, a);
  }
  const accounts = [...byAccount.entries()]
    .map(([account, v]) => ({
      account,
      debit: v.debit,
      credit: v.credit,
      net: v.credit - v.debit,
    }))
    .sort((a, b) => a.account.localeCompare(b.account));
  return { accounts, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}
