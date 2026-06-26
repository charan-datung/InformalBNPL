import { describe, it, expect } from "vitest";
import { computeLoanTerms, effectiveAnnualRate } from "@/lib/loans/finance";

const START = new Date("2026-06-01T00:00:00Z");

describe("computeLoanTerms", () => {
  it("breaks down interest, processing fee, finance charge and total", () => {
    const t = computeLoanTerms({
      principalCentavos: 300_000, // ₱3,000
      tenorMonths: 3,
      interestRateMonthly: 0.035,
      processingFeePct: 3,
      startDate: START,
    });
    expect(t.monthlyInterestCentavos).toBe(10_500); // round(300000 * 0.035)
    expect(t.totalInterestCentavos).toBe(31_500); // 10500 * 3
    expect(t.processingFeeCentavos).toBe(9_000); // 3% of 300000
    expect(t.financeChargeCentavos).toBe(40_500); // 31500 + 9000
    expect(t.totalPayableCentavos).toBe(340_500); // 300000 + 40500
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
    // Principal portions reconcile to the principal exactly.
    const sumPrincipal = t.installments.reduce(
      (a, i) => a + i.principalCentavos,
      0,
    );
    expect(sumPrincipal).toBe(300_000);
    // Finance-charge portions reconcile to the finance charge exactly.
    const sumFinance = t.installments.reduce(
      (a, i) => a + i.financeChargeCentavos,
      0,
    );
    expect(sumFinance).toBe(t.financeChargeCentavos);
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
