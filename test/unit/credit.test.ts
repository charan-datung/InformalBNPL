import { describe, it, expect } from "vitest";
import { availableFromLoans } from "@/lib/loans/credit";

describe("revolving credit math", () => {
  it("counts only loans that haven't settled or refunded as outstanding", () => {
    const c = availableFromLoans(5_000_000, [
      { ticket_centavos: 1_000_000, status: "repaying" },
      { ticket_centavos: 2_000_000, status: "escrow_held" },
      { ticket_centavos: 500_000, status: "settled" }, // freed
      { ticket_centavos: 500_000, status: "refunded" }, // freed
    ]);
    expect(c.outstandingCentavos).toBe(3_000_000);
    expect(c.availableCentavos).toBe(2_000_000);
    expect(c.limitCentavos).toBe(5_000_000);
  });

  it("frees the whole line when everything has settled", () => {
    const c = availableFromLoans(5_000_000, [
      { ticket_centavos: 5_000_000, status: "settled" },
    ]);
    expect(c.availableCentavos).toBe(5_000_000);
  });

  it("never goes negative when over-exposed", () => {
    const c = availableFromLoans(1_000, [
      { ticket_centavos: 2_000, status: "repaying" },
    ]);
    expect(c.availableCentavos).toBe(0);
  });

  it("returns the full limit with no loans", () => {
    expect(availableFromLoans(5_000_000, []).availableCentavos).toBe(5_000_000);
  });
});
