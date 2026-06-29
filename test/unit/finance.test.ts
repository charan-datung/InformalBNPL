import { describe, it, expect } from "vitest";
import {
  computeLoanTerms,
  effectiveAnnualRate,
  installmentPenaltyCentavos,
} from "@/lib/loans/finance";

const START = new Date("2026-06-01T00:00:00Z");

describe("computeLoanTerms", () => {
  it("capitalizes the fee, then breaks down interest, finance charge and total", () => {
    const t = computeLoanTerms({
      principalCentavos: 300_000, // ₱3,000 purchase
      tenorMonths: 3,
      interestRateMonthly: 0.035,
      processingFeePct: 3,
      startDate: START,
    });
    expect(t.amountFinancedCentavos).toBe(300_000); // cash value received
    expect(t.processingFeeCentavos).toBe(9_000); // 3% of 300000
    expect(t.loanAmountCentavos).toBe(309_000); // principal incl. fee
    expect(t.monthlyInterestCentavos).toBe(10_815); // round(309000 * 0.035)
    expect(t.totalInterestCentavos).toBe(32_445); // 10815 * 3
    expect(t.financeChargeCentavos).toBe(41_445); // 9000 + 32445
    expect(t.totalPayableCentavos).toBe(341_445); // 309000 + 32445
  });

  it("splits the total payable exactly across installments", () => {
    const t = computeLoanTerms({
      principalCentavos: 300_000,
      tenorMonths: 3,
      interestRateMonthly: 0.035,
      processingFeePct: 3,
      startDate: START,
    });
    expect(t.installments).toHaveLength(3);
    const sumAmount = t.installments.reduce((a, i) => a + i.amountCentavos, 0);
    expect(sumAmount).toBe(t.totalPayableCentavos);
    // Principal portions reconcile to the loan amount (incl. capitalized fee).
    const sumPrincipal = t.installments.reduce(
      (a, i) => a + i.principalCentavos,
      0,
    );
    expect(sumPrincipal).toBe(309_000);
    // Interest portions reconcile to total interest exactly.
    const sumInterest = t.installments.reduce(
      (a, i) => a + i.interestCentavos,
      0,
    );
    expect(sumInterest).toBe(t.totalInterestCentavos);
  });

  it("computes due dates in UTC (monthly steps, no timezone drift)", () => {
    const t = computeLoanTerms({
      principalCentavos: 300_000,
      tenorMonths: 3,
      interestRateMonthly: 0.035,
      startDate: START,
    });
    expect(t.installments.map((i) => i.dueDate)).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);
    expect(t.firstDueDate).toBe("2026-07-01");
    expect(t.lastDueDate).toBe("2026-09-01");
  });

  it("biweekly keeps the same total but doubles the installments", () => {
    const monthly = computeLoanTerms({
      principalCentavos: 300_000,
      tenorMonths: 2,
      interestRateMonthly: 0.035,
      processingFeePct: 3,
      frequency: "monthly",
      startDate: START,
    });
    const biweekly = computeLoanTerms({
      principalCentavos: 300_000,
      tenorMonths: 2,
      interestRateMonthly: 0.035,
      processingFeePct: 3,
      frequency: "biweekly",
      startDate: START,
    });
    expect(biweekly.totalPayableCentavos).toBe(monthly.totalPayableCentavos);
    expect(monthly.installments).toHaveLength(2);
    expect(biweekly.installments).toHaveLength(4);
    expect(biweekly.installments[0].dueDate).toBe("2026-06-15"); // +14d
  });

  it("reports a higher effective rate than the flat nominal rate", () => {
    const t = computeLoanTerms({
      principalCentavos: 300_000,
      tenorMonths: 3,
      interestRateMonthly: 0.035,
      processingFeePct: 3,
      startDate: START,
    });
    // Flat 3.5%/mo nominal; EIR on a flat amortizing loan is materially higher.
    expect(t.nominalRateMonthlyPct).toBeCloseTo(3.5, 5);
    expect(t.eirMonthlyPct).toBeGreaterThan(t.nominalRateMonthlyPct);
    // And it must stay within the SEC MC 3-2022 EIR ceiling (15%/mo).
    expect(t.eirMonthlyPct).toBeLessThan(15);
  });

  it("returns a zero effective rate when there is no finance charge", () => {
    const t = computeLoanTerms({
      principalCentavos: 300_000,
      tenorMonths: 3,
      interestRateMonthly: 0,
      processingFeePct: 0,
      startDate: START,
    });
    expect(t.financeChargeCentavos).toBe(0);
    expect(t.eirAnnualPct).toBe(0);
  });

  it("yields an empty schedule for invalid input", () => {
    expect(
      computeLoanTerms({
        principalCentavos: 0,
        tenorMonths: 3,
        interestRateMonthly: 0.035,
      }).installments,
    ).toHaveLength(0);
  });
});

describe("installmentPenaltyCentavos", () => {
  const base = {
    amountCentavos: 100_000, // ₱1,000
    dueDate: "2026-06-01",
    penaltyRateMonthly: 0.05,
  };
  it("is zero before and on the due date", () => {
    expect(
      installmentPenaltyCentavos({ ...base, todayIso: "2026-05-20" }),
    ).toBe(0);
    expect(
      installmentPenaltyCentavos({ ...base, todayIso: "2026-06-01" }),
    ).toBe(0);
  });
  it("accrues a full month's penalty after 30 days", () => {
    // 30 days late → 5% of ₱1,000 = ₱50.00
    expect(
      installmentPenaltyCentavos({ ...base, todayIso: "2026-07-01" }),
    ).toBe(5_000);
  });
  it("prorates by day", () => {
    // 15 days late → ~2.5% = ₱25.00
    expect(
      installmentPenaltyCentavos({ ...base, todayIso: "2026-06-16" }),
    ).toBe(2_500);
  });
});

describe("effectiveAnnualRate", () => {
  it("prices a single bullet payment to its simple return", () => {
    // Borrow 100,000; repay 110,000 in exactly one year → 10% effective.
    const eir = effectiveAnnualRate(100_000, [
      { amountCentavos: 110_000, dayOffset: 365 },
    ]);
    expect(eir).toBeCloseTo(0.1, 3);
  });

  it("is zero when repayments never exceed principal", () => {
    expect(
      effectiveAnnualRate(100_000, [{ amountCentavos: 100_000, dayOffset: 365 }]),
    ).toBe(0);
  });
});
