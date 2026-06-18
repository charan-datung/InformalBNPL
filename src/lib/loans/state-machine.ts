/**
 * Loan status state machine — the single source of truth for which loan
 * status transitions are allowed.
 *
 * The Postgres `loan_status` enum constrains *values*; this module constrains
 * *transitions*. Every server-side mutation that changes a loan's status MUST
 * call `assertTransition(from, to)` first, so an invalid jump (e.g. booked ->
 * settled) is rejected before it touches the database.
 *
 * Lifecycle (happy path is the top row):
 *
 *   booked → escrow_held → shipped ─┬─ delivered_confirmed ─┐
 *                                   ├─ auto_released ────────┤
 *                                   └─ dispute_raised ───────┤
 *                                                            ↓
 *                                  escrow_released → repaying → settled
 *
 *   Side states (reachable as noted below):
 *     refunded             — terminal; money returned to buyer.
 *     frozen_fraud_review  — a hold; any active state can enter it.
 *
 * Pilot simplifications (documented on purpose):
 *   - `frozen_fraud_review` resumes to `escrow_released` when cleared (or
 *     `refunded` if fraud is confirmed); it does not remember the exact
 *     pre-freeze state.
 *   - A dispute is represented by the `dispute_raised` status; its outcome is
 *     either `escrow_released` (seller's favour) or `refunded` (buyer's favour).
 */

export const LOAN_STATUSES = [
  "booked",
  "escrow_held",
  "shipped",
  "delivered_confirmed",
  "dispute_raised",
  "auto_released",
  "escrow_released",
  "repaying",
  "settled",
  "refunded",
  "frozen_fraud_review",
] as const;

export type LoanStatus = (typeof LOAN_STATUSES)[number];

/**
 * Allowed transitions: for each status, the set of statuses it may move to.
 * An empty array marks a terminal status.
 */
export const LOAN_TRANSITIONS: Record<LoanStatus, readonly LoanStatus[]> = {
  // Happy path
  booked: ["escrow_held", "refunded", "frozen_fraud_review"],
  escrow_held: ["shipped", "refunded", "frozen_fraud_review"],
  shipped: [
    "delivered_confirmed",
    "auto_released",
    "dispute_raised",
    "frozen_fraud_review",
  ],
  delivered_confirmed: ["escrow_released", "frozen_fraud_review"],
  auto_released: ["escrow_released", "frozen_fraud_review"],
  dispute_raised: ["escrow_released", "refunded", "frozen_fraud_review"],
  escrow_released: ["repaying", "frozen_fraud_review"],
  repaying: ["settled", "frozen_fraud_review"],

  // Terminal
  settled: [],
  refunded: [],

  // Side state (hold). Cleared -> escrow_released; fraud confirmed -> refunded.
  frozen_fraud_review: ["escrow_released", "refunded"],
};

/** Statuses from which no further transition is possible. */
export const TERMINAL_STATUSES: readonly LoanStatus[] = LOAN_STATUSES.filter(
  (s) => LOAN_TRANSITIONS[s].length === 0,
);

/** Type guard: is `value` one of the known loan statuses? */
export function isLoanStatus(value: unknown): value is LoanStatus {
  return (
    typeof value === "string" &&
    (LOAN_STATUSES as readonly string[]).includes(value)
  );
}

/** The statuses reachable from `from` in one step. */
export function nextStates(from: LoanStatus): readonly LoanStatus[] {
  return LOAN_TRANSITIONS[from];
}

/** Whether `from -> to` is an allowed single transition. */
export function canTransition(from: LoanStatus, to: LoanStatus): boolean {
  return LOAN_TRANSITIONS[from].includes(to);
}

/** Whether `status` is terminal (no outgoing transitions). */
export function isTerminal(status: LoanStatus): boolean {
  return LOAN_TRANSITIONS[status].length === 0;
}

/** Thrown by `assertTransition` when a transition is not allowed. */
export class InvalidLoanTransitionError extends Error {
  constructor(
    public readonly from: LoanStatus,
    public readonly to: LoanStatus,
  ) {
    super(
      `Invalid loan transition: ${from} -> ${to}. ` +
        `Allowed from ${from}: ${LOAN_TRANSITIONS[from].join(", ") || "(none — terminal)"}.`,
    );
    this.name = "InvalidLoanTransitionError";
  }
}

/**
 * Assert that `from -> to` is allowed, throwing InvalidLoanTransitionError if
 * not. Call this before persisting any loan status change.
 */
export function assertTransition(from: LoanStatus, to: LoanStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidLoanTransitionError(from, to);
  }
}
