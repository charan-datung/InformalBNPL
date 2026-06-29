import { describe, it, expect } from "vitest";
import { buyerStats, sellerStats } from "@/lib/loans/stats";
import type { BuyerLoanView, SellerLoanView } from "@/lib/loans/views";

function rep(
  partial: Partial<BuyerLoanView["repayments"][number]>,
): BuyerLoanView["repayments"][number] {
  return {
    id: "r",
    amount_centavos: 0,
    principal_centavos: null,
    interest_centavos: null,
    due_date: "2026-06-01",
    paid_at: null,
    status: "scheduled",
    ...partial,
  };
}

function buyerLoan(partial: Partial<BuyerLoanView>): BuyerLoanView {
  return {
    id: "l",
    status: "repaying",
    ticket_centavos: 100000,
    tenor_months: 3,
    sellerName: "Aling Nena",
    created_at: "2026-06-01T00:00:00Z",
    shippedAt: null,
    handoverCode: null,
    repayments: [],
    ...partial,
  };
}

function sellerLoan(partial: Partial<SellerLoanView>): SellerLoanView {
  return {
    id: "l",
    status: "escrow_held",
    ticket_centavos: 100000,
    tenor_months: 3,
    merchant_fee_pct: 5,
    feeCentavos: 5000,
    netCentavos: 95000,
    buyerName: "Juan",
    created_at: "2026-06-10T00:00:00Z",
    shippedAt: null,
    deliveredAt: null,
    releasedAt: null,
    handoverPending: false,
    ...partial,
  };
}

describe("buyerStats", () => {
  it("splits paid vs owed and flags overdue installments", () => {
    const s = buyerStats(
      [
        buyerLoan({
          id: "a",
          status: "repaying",
          repayments: [
            rep({ id: "1", amount_centavos: 30000, due_date: "2026-05-01", status: "paid", paid_at: "2026-04-28T00:00:00Z" }),
            rep({ id: "2", amount_centavos: 30000, due_date: "2026-06-01", status: "scheduled" }),
            rep({ id: "3", amount_centavos: 30000, due_date: "2026-07-01", status: "scheduled" }),
          ],
        }),
      ],
      "2026-06-15",
    );

    expect(s.totalPaidCentavos).toBe(30000);
    expect(s.totalOwedCentavos).toBe(60000);
    expect(s.installmentsPaid).toBe(1);
    expect(s.installmentsTotal).toBe(3);
    expect(s.onTimePct).toBe(100);
    // Due 2026-06-01 is before "today" 2026-06-15 → overdue.
    expect(s.overdueCount).toBe(1);
    expect(s.nextPayment?.dueDate).toBe("2026-06-01");
    expect(s.upcoming).toHaveLength(2);
  });

  it("ignores waived installments and reports no on-time rate before any payment", () => {
    const s = buyerStats(
      [
        buyerLoan({
          repayments: [
            rep({ id: "1", amount_centavos: 50000, status: "waived" }),
            rep({ id: "2", amount_centavos: 50000, due_date: "2026-09-01", status: "scheduled" }),
          ],
        }),
      ],
      "2026-06-15",
    );

    expect(s.installmentsTotal).toBe(1);
    expect(s.totalOwedCentavos).toBe(50000);
    expect(s.onTimePct).toBeNull();
  });

  it("marks a late payment (paid after due date) as not on-time", () => {
    const s = buyerStats(
      [
        buyerLoan({
          repayments: [
            rep({ id: "1", due_date: "2026-05-01", status: "paid", paid_at: "2026-05-09T00:00:00Z", amount_centavos: 10000 }),
          ],
        }),
      ],
      "2026-06-15",
    );
    expect(s.onTimePct).toBe(0);
  });
});

describe("sellerStats", () => {
  it("buckets net into pending vs paid out and excludes refunds from gross", () => {
    const s = sellerStats(
      [
        sellerLoan({ id: "a", status: "escrow_held", ticket_centavos: 100000, feeCentavos: 5000, netCentavos: 95000, created_at: "2026-06-10T00:00:00Z" }),
        sellerLoan({ id: "b", status: "settled", ticket_centavos: 200000, feeCentavos: 10000, netCentavos: 190000, created_at: "2026-05-02T00:00:00Z" }),
        sellerLoan({ id: "c", status: "refunded", ticket_centavos: 50000, feeCentavos: 2500, netCentavos: 47500, created_at: "2026-06-01T00:00:00Z" }),
      ],
      "2026-06",
    );

    expect(s.grossSalesCentavos).toBe(300000); // refund excluded
    expect(s.pendingPayoutCentavos).toBe(95000); // escrow_held net
    expect(s.paidOutCentavos).toBe(190000); // settled net
    expect(s.feesCentavos).toBe(15000); // refund's fee excluded
    expect(s.activeOrders).toBe(1);
    expect(s.completedOrders).toBe(1);
    expect(s.totalOrders).toBe(3);
    expect(s.thisMonthSalesCentavos).toBe(100000); // only order "a" is June
  });
});
