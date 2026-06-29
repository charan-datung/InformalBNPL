import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Double-entry ledger posting.
 *
 * Every business event is one balanced transaction (sum of debits === sum of
 * credits). We assert the balance in code before inserting, so the ledger can
 * never hold a lopsided transaction even though the rows go in together.
 */

export const LEDGER_ACCOUNTS = {
  buyerReceivable: "buyer_receivable", // asset: principal the buyer owes us
  sellerPayable: "seller_payable", // liability: net we owe the seller now
  sellerReserve: "seller_reserve", // liability: rolling reserve withheld
  merchantFeeIncome: "merchant_fee_income", // income: our fee on the sale
  processingFeeIncome: "processing_fee_income", // income: buyer processing fee
  interestIncome: "interest_income", // income: financing interest earned
  cashClearing: "cash_clearing", // clearing: buyer repayments received
  payoutClearing: "payout_clearing", // clearing: payouts staged for rails
} as const;

export type Line = {
  account: string;
  direction: "debit" | "credit";
  amountCentavos: number;
  memo?: string;
};

/** Sum the debit and credit sides of a set of lines. Pure. */
export function balanceOf(lines: Line[]): { debits: number; credits: number } {
  let debits = 0;
  let credits = 0;
  for (const l of lines) {
    if (l.direction === "debit") debits += l.amountCentavos;
    else credits += l.amountCentavos;
  }
  return { debits, credits };
}

/** Throw unless every line nets to a balanced (double-entry) transaction. Pure. */
export function assertBalanced(lines: Line[]): void {
  const { debits, credits } = balanceOf(lines);
  if (debits !== credits) {
    throw new Error(
      `Unbalanced ledger transaction: debits ${debits} ≠ credits ${credits}`,
    );
  }
}

/**
 * The balanced lines for a loan disbursement (principal flow). The buyer owes
 * the principal; we recognise our merchant fee; for an informal seller we
 * withhold a rolling reserve as a separate liability; and the remainder is what
 * we owe the seller now. Pure, so the splits and the balance invariant are
 * unit-testable without a DB. Zero-value lines are omitted (the ledger requires
 * positive amounts).
 */
export function disbursementLines(
  ticketCentavos: number,
  merchantFeePct: number,
  reservePct = 0,
  processingFeeCentavos = 0,
): Line[] {
  const fee = Math.round((ticketCentavos * merchantFeePct) / 100);
  const reserve = Math.round((ticketCentavos * reservePct) / 100);
  const sellerNet = ticketCentavos - fee - reserve;
  // The buyer owes the loan principal, which capitalizes the processing fee on
  // top of the purchase; that fee is our income, recognized at disbursement.
  const lines: Line[] = [
    {
      account: LEDGER_ACCOUNTS.buyerReceivable,
      direction: "debit",
      amountCentavos: ticketCentavos + processingFeeCentavos,
      memo: "Principal receivable from buyer (incl. processing fee)",
    },
    {
      account: LEDGER_ACCOUNTS.sellerPayable,
      direction: "credit",
      amountCentavos: sellerNet,
      memo: "Net payable to seller",
    },
    {
      account: LEDGER_ACCOUNTS.merchantFeeIncome,
      direction: "credit",
      amountCentavos: fee,
      memo: `Merchant fee ${merchantFeePct}%`,
    },
  ];
  if (reserve > 0) {
    lines.push({
      account: LEDGER_ACCOUNTS.sellerReserve,
      direction: "credit",
      amountCentavos: reserve,
      memo: `Rolling reserve ${reservePct}% withheld`,
    });
  }
  if (processingFeeCentavos > 0) {
    lines.push({
      account: LEDGER_ACCOUNTS.processingFeeIncome,
      direction: "credit",
      amountCentavos: processingFeeCentavos,
      memo: "Processing fee (capitalized)",
    });
  }
  return lines;
}

const REFUND_MEMO = "Refund reversal";

/**
 * Unwind a loan's ledger on refund: post the opposite of each account's current
 * net balance for the loan, bringing every account to zero. Because every prior
 * transaction is balanced, the loan's per-account nets sum to zero, so the
 * reversal is itself balanced. Idempotent (skips if already reversed) and a
 * no-op when nothing was ever posted (e.g. refunded straight from `booked`).
 * Refunds only happen pre-release (booked/escrow_held/dispute/frozen), so there
 * are no seller payouts or repayments to claw back.
 */
export async function reverseLoanLedger(
  admin: SupabaseClient,
  loanId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("ledger_entries")
    .select("account, direction, amount_centavos, memo")
    .eq("loan_id", loanId);
  if (error) throw new Error(`Ledger read failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return null;
  if (rows.some((r) => r.memo === REFUND_MEMO)) return null; // already reversed

  const net = new Map<string, number>();
  for (const r of rows) {
    const signed =
      r.direction === "credit" ? r.amount_centavos : -r.amount_centavos;
    net.set(r.account, (net.get(r.account) ?? 0) + signed);
  }
  const lines: Line[] = [];
  for (const [account, n] of net) {
    if (n === 0) continue;
    lines.push({
      account,
      direction: n > 0 ? "debit" : "credit", // opposite, to zero the balance
      amountCentavos: Math.abs(n),
      memo: REFUND_MEMO,
    });
  }
  if (lines.length === 0) return null;
  return postTransaction(admin, loanId, lines);
}

async function postTransaction(
  admin: SupabaseClient,
  loanId: string,
  lines: Line[],
): Promise<string> {
  assertBalanced(lines);
  const txnId = randomUUID();
  const { error } = await admin.from("ledger_entries").insert(
    lines.map((l) => ({
      txn_id: txnId,
      loan_id: loanId,
      account: l.account,
      direction: l.direction,
      amount_centavos: l.amountCentavos,
      memo: l.memo ?? null,
    })),
  );
  if (error) throw new Error(`Ledger post failed: ${error.message}`);
  return txnId;
}

/**
 * Record the principal flow when a loan is disbursed (credit extended at
 * checkout): the buyer owes us the principal, we owe the seller the principal
 * net of our merchant fee, and we recognise that fee as income.
 */
export async function postLoanDisbursement(
  admin: SupabaseClient,
  input: {
    loanId: string;
    ticketCentavos: number;
    merchantFeePct: number;
    reservePct?: number;
    processingFeeCentavos?: number;
  },
): Promise<string> {
  return postTransaction(
    admin,
    input.loanId,
    disbursementLines(
      input.ticketCentavos,
      input.merchantFeePct,
      input.reservePct ?? 0,
      input.processingFeeCentavos ?? 0,
    ),
  );
}
