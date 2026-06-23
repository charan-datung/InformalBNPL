import { describe, it, expect } from "vitest";
import {
  assertBalanced,
  balanceOf,
  disbursementLines,
  LEDGER_ACCOUNTS,
} from "@/lib/ledger/post";

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
