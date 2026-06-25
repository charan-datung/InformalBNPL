import { describe, it, expect } from "vitest";
import { computeSchedule } from "@/lib/loans/schedule";

describe("computeSchedule", () => {
  it("splits total across installments with the last absorbing the remainder", () => {
    const s = computeSchedule(100_000, 3, 0.035);
    expect(s.monthlyInterestCentavos).toBe(3_500); // round(100000 * 0.035)
    expect(s.totalCentavos).toBe(110_500); // 100000 + 3500*3
    expect(s.interestCentavos).toBe(10_500); // 3500 * 3
    expect(s.installments).toHaveLength(3);
    // Installments sum exactly to the total (no centavo lost or invented).
    const sum = s.installments.reduce((a, i) => a + i.amountCentavos, 0);
    expect(sum).toBe(s.totalCentavos);
    // Principal across installments sums to the ticket.
    const principal = s.installments.reduce((a, i) => a + i.principalCentavos, 0);
    expect(principal).toBe(100_000);
    // Every installment carries the same flat monthly interest.
    expect(s.installments.every((i) => i.interestCentavos === 3_500)).toBe(true);
  });

  it("handles a single-month tenor", () => {
    const s = computeSchedule(50_000, 1, 0.035);
    expect(s.installments).toHaveLength(1);
    expect(s.installments[0].amountCentavos).toBe(s.totalCentavos);
  });

  it("charges no interest at a zero rate", () => {
    const s = computeSchedule(90_000, 3, 0);
    expect(s.interestCentavos).toBe(0);
    const sum = s.installments.reduce((a, i) => a + i.amountCentavos, 0);
    expect(sum).toBe(90_000);
  });

  it("returns an empty schedule for invalid input", () => {
    expect(computeSchedule(0, 3, 0.035).installments).toHaveLength(0);
    expect(computeSchedule(100_000, 0, 0.035).installments).toHaveLength(0);
  });

  it("biweekly splits the same total into twice as many installments", () => {
    const start = new Date("2026-06-01T00:00:00Z");
    const monthly = computeSchedule(100_000, 2, 0.035, "monthly", start);
    const biweekly = computeSchedule(100_000, 2, 0.035, "biweekly", start);

    // Frequency must NOT change the cost.
    expect(biweekly.totalCentavos).toBe(monthly.totalCentavos);
    expect(biweekly.interestCentavos).toBe(monthly.interestCentavos);

    // 2 months => 4 biweekly installments.
    expect(monthly.installments).toHaveLength(2);
    expect(biweekly.installments).toHaveLength(4);

    // Parts still reconcile exactly.
    const sum = biweekly.installments.reduce((a, i) => a + i.amountCentavos, 0);
    expect(sum).toBe(biweekly.totalCentavos);
    const principal = biweekly.installments.reduce(
      (a, i) => a + i.principalCentavos,
      0,
    );
    expect(principal).toBe(100_000);
  });

  it("steps biweekly due dates 14 days apart", () => {
    const start = new Date("2026-06-01T00:00:00Z");
    const s = computeSchedule(50_000, 1, 0.035, "biweekly", start);
    expect(s.installments).toHaveLength(2);
    expect(s.installments[0].dueDate).toBe("2026-06-15"); // +14d
    expect(s.installments[1].dueDate).toBe("2026-06-29"); // +28d
  });
});
