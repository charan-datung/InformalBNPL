import { describe, it, expect } from "vitest";
import {
  assertBalanced,
  balanceOf,
  disbursementLines,
  reverseLoanLedger,
  LEDGER_ACCOUNTS,
} from "@/lib/ledger/post";

/** Minimal fake Supabase client for reverseLoanLedger: returns canned existing
 *  rows on select, captures the inserted reversal rows. */
function fakeAdmin(existing: Array<{ account: string; direction: string; amount_centavos: number; memo: string | null }>) {
  const captured: { rows: typeof existing | null } = { rows: null };
  const admin = {
    from() {
      return {
        select() {
          return { eq: async () => ({ data: existing, error: null }) };
        },
        async insert(rows: typeof existing) {
          captured.rows = rows;
          return { error: null };
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, captured };
}

describe("double-entry ledger", () => {
  it("builds a balanced disbursement: ticket = sellerNet + fee", () => {
    const lines = disbursementLines(100_000, 5);
    const fee = lines.find((l) => l.account === LEDGER_ACCOUNTS.merchantFeeIncome)!;
    const net = lines.find((l) => l.account === LEDGER_ACCOUNTS.sellerPayable)!;
    const recv = lines.find((l) => l.account === LEDGER_ACCOUNTS.buyerReceivable)!;
    expect(fee.amountCentavos).toBe(5_000); // 5% of 100000
    expect(net.amountCentavos).toBe(95_000);
    expect(recv.amountCentavos).toBe(100_000);
    const { debits, credits } = balanceOf(lines);
    expect(debits).toBe(credits);
    expect(() => assertBalanced(lines)).not.toThrow();
  });

  it("rounds the fee consistently", () => {
    const lines = disbursementLines(150_000, 5);
    expect(balanceOf(lines)).toEqual({ debits: 150_000, credits: 150_000 });
  });

  it("withholds a rolling reserve as a separate balanced line", () => {
    const lines = disbursementLines(100_000, 5, 10); // fee 5k, reserve 10k
    const reserve = lines.find((l) => l.account === LEDGER_ACCOUNTS.sellerReserve)!;
    const net = lines.find((l) => l.account === LEDGER_ACCOUNTS.sellerPayable)!;
    expect(reserve.amountCentavos).toBe(10_000);
    expect(net.amountCentavos).toBe(85_000); // 100k - 5k fee - 10k reserve
    expect(balanceOf(lines)).toEqual({ debits: 100_000, credits: 100_000 });
  });

  it("omits the reserve line when reserve is zero (no zero-value lines)", () => {
    const lines = disbursementLines(100_000, 5, 0);
    expect(lines.some((l) => l.account === LEDGER_ACCOUNTS.sellerReserve)).toBe(false);
    expect(lines).toHaveLength(3);
  });

  it("throws on an unbalanced transaction", () => {
    expect(() =>
      assertBalanced([
        { account: "a", direction: "debit", amountCentavos: 100 },
        { account: "b", direction: "credit", amountCentavos: 99 },
      ]),
    ).toThrow(/Unbalanced/);
  });

  it("sums an empty set to zero", () => {
    expect(balanceOf([])).toEqual({ debits: 0, credits: 0 });
  });
});

describe("refund reversal", () => {
  const asRows = () =>
    disbursementLines(100_000, 7, 0, 3_000).map((l) => ({
      account: l.account,
      direction: l.direction,
      amount_centavos: l.amountCentavos,
      memo: l.memo ?? null,
    }));

  it("posts a balanced reversal that zeroes every account", async () => {
    const existing = asRows();
    const { admin, captured } = fakeAdmin(existing);
    await reverseLoanLedger(admin, "loan1");

    const reversal = captured.rows!;
    // The reversal itself is balanced.
    expect(
      balanceOf(
        reversal.map((r) => ({
          account: r.account,
          direction: r.direction as "debit" | "credit",
          amountCentavos: r.amount_centavos,
        })),
      ),
    ).toMatchObject({ debits: expect.any(Number) });
    const { debits, credits } = balanceOf(
      reversal.map((r) => ({
        account: r.account,
        direction: r.direction as "debit" | "credit",
        amountCentavos: r.amount_centavos,
      })),
    );
    expect(debits).toBe(credits);

    // existing + reversal nets to zero per account.
    const net = new Map<string, number>();
    for (const r of [...existing, ...reversal]) {
      const s = r.direction === "credit" ? r.amount_centavos : -r.amount_centavos;
      net.set(r.account, (net.get(r.account) ?? 0) + s);
    }
    for (const v of net.values()) expect(v).toBe(0);
  });

  it("is idempotent: skips when already reversed", async () => {
    const existing = [
      ...asRows(),
      { account: "buyer_receivable", direction: "credit", amount_centavos: 1, memo: "Refund reversal" },
    ];
    const { admin, captured } = fakeAdmin(existing);
    const txn = await reverseLoanLedger(admin, "loan1");
    expect(txn).toBeNull();
    expect(captured.rows).toBeNull();
  });

  it("no-ops when nothing was posted", async () => {
    const { admin, captured } = fakeAdmin([]);
    const txn = await reverseLoanLedger(admin, "loan1");
    expect(txn).toBeNull();
    expect(captured.rows).toBeNull();
  });
});
