import type { LoanStatus } from "@/lib/loans/state-machine";

/**
 * Escrow event types — mirrors the Postgres `escrow_event_type` enum. Every
 * row in the append-only escrow_events log carries one of these.
 */
export const ESCROW_EVENT_TYPES = [
  "booked",
  "escrow_held",
  "shipped",
  "delivered_confirmed",
  "dispute_raised",
  "auto_released",
  "dispute_resolved",
  "escrow_released",
  "merchant_fee_deducted",
  "repayment_recorded",
  "settled",
  "refunded",
  "frozen_fraud_review",
  "unfrozen",
  "note",
] as const;

export type EscrowEventType = (typeof ESCROW_EVENT_TYPES)[number];

/**
 * Default audit event_type to log when a loan enters a given status. Most
 * statuses have a same-named event; `repaying` has no dedicated event (actual
 * repayments are logged separately as `repayment_recorded`), so entering it is
 * recorded as a `note`. Callers may override the event type when a transition
 * has a more specific meaning (e.g. clearing a freeze -> `unfrozen`).
 */
export const STATUS_EVENT_TYPE: Record<LoanStatus, EscrowEventType> = {
  booked: "booked",
  escrow_held: "escrow_held",
  shipped: "shipped",
  delivered_confirmed: "delivered_confirmed",
  dispute_raised: "dispute_raised",
  auto_released: "auto_released",
  escrow_released: "escrow_released",
  repaying: "note",
  settled: "settled",
  refunded: "refunded",
  frozen_fraud_review: "frozen_fraud_review",
};
