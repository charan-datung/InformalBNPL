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
): Line[] {
  const fee = Math.round((ticketCentavos * merchantFeePct) / 100);
  const reserve = Math.round((ticketCentavos * reservePct) / 100);
  const sellerNet = ticketCentavos - fee - reserve;
  const lines: Line[] = [
    {
      account: LEDGER_ACCOUNTS.buyerReceivable,
      direction: "debit",
      amountCentavos: ticketCentavos,
      memo: "Principal receivable from buyer",
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
  return lines;
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
  },
): Promise<string> {
  return postTransaction(
    admin,
    input.loanId,
    disbursementLines(
      input.ticketCentavos,
      input.merchantFeePct,
      input.reservePct ?? 0,
    ),
  );
}
