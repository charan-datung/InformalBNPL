import { describe, it, expect } from "vitest";
import {
  assertTransition,
  InvalidLoanTransitionError,
  isLoanStatus,
  nextStates,
} from "@/lib/loans/state-machine";

describe("loan state machine", () => {
  it("allows legal transitions on the happy path", () => {
    expect(() => assertTransition("booked", "escrow_held")).not.toThrow();
    expect(() => assertTransition("escrow_released", "repaying")).not.toThrow();
    expect(() => assertTransition("repaying", "settled")).not.toThrow();
  });

  it("rejects illegal jumps", () => {
    expect(() => assertTransition("booked", "settled")).toThrow(
      InvalidLoanTransitionError,
    );
    expect(() => assertTransition("settled", "repaying")).toThrow();
  });

  it("treats terminal statuses as dead ends", () => {
    expect(nextStates("settled")).toHaveLength(0);
    expect(nextStates("refunded")).toHaveLength(0);
  });

  it("guards unknown status values", () => {
    expect(isLoanStatus("booked")).toBe(true);
    expect(isLoanStatus("not_a_status")).toBe(false);
    expect(isLoanStatus(null)).toBe(false);
  });
});
