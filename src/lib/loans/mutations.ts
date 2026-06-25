import { createAdminClient } from "@/lib/supabase/admin";
import { getConfigValue } from "@/lib/config/system-config";
import { maybeQualifySellerReferral } from "@/lib/referrals/seller-referrals";
import {
  assertTransition,
  isLoanStatus,
  type LoanStatus,
} from "@/lib/loans/state-machine";
import {
  STATUS_EVENT_TYPE,
  type EscrowEventType,
} from "@/lib/loans/events";

/**
 * Server-side loan mutations — the trusted core that actually changes loan
 * state. These use the SERVICE ROLE client (RLS bypassed) and run the
 * state-machine validator before writing, so an illegal transition never
 * reaches the database. They do NOT check who the caller is; auth/role checks
 * belong in the layer above (server actions). Never import this into a Client
 * Component.
 *
 * Every state change goes through a Postgres RPC that writes the loan row and
 * its escrow_events audit row in one transaction.
 */

/** A loan row as returned by the mutation RPCs. */
export type Loan = {
  id: string;
  buyer_user_id: string;
  seller_user_id: string;
  ticket_centavos: number;
  tenor_months: number;
  interest_rate_monthly: number;
  merchant_fee_pct: number;
  status: LoanStatus;
  created_at: string;
  updated_at: string;
};

/** Programmatic error codes for mutation failures the caller may handle. */
export type MutationErrorCode =
  | "validation" // input/business-rule rejected (e.g. buyer lacks capability)
  | "not_found" // loan does not exist
  | "conflict" // loan changed under us / not in expected state
  | "db"; // unexpected database error

export class LoanMutationError extends Error {
  constructor(
    public readonly code: MutationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LoanMutationError";
  }
}

export type BookLoanInput = {
  buyerUserId: string;
  sellerUserId: string;
  ticketCentavos: number;
  tenorMonths: number;
  /** Defaults to system_config `default_interest_rate_monthly`. */
  interestRateMonthly?: number;
  /** Defaults to system_config `default_merchant_fee_pct`. */
  merchantFeePct?: number;
  /** Operator/admin performing the booking (recorded on the audit event). */
  actorUserId?: string | null;
  note?: string | null;
};

/**
 * Book a new loan in `booked` state, recording the initial audit event.
 *
 * Enforces the capability model: the buyer must have an activated, KYC-verified
 * buyer_profile; the seller likewise a seller_profile; and the ticket must fit
 * within the buyer's credit limit. Missing rate/fee fall back to system_config
 * defaults.
 */
export async function bookLoan(input: BookLoanInput): Promise<Loan> {
  const supabase = createAdminClient();

  if (input.buyerUserId === input.sellerUserId) {
    throw new LoanMutationError(
      "validation",
      "Buyer and seller must be different users.",
    );
  }
  if (!Number.isInteger(input.ticketCentavos) || input.ticketCentavos <= 0) {
    throw new LoanMutationError(
      "validation",
      "ticketCentavos must be a positive integer (centavos).",
    );
  }
  if (!Number.isInteger(input.tenorMonths) || input.tenorMonths <= 0) {
    throw new LoanMutationError(
      "validation",
      "tenorMonths must be a positive integer.",
    );
  }

  // Buyer must be an activated, verified buyer.
  const { data: buyer, error: buyerErr } = await supabase
    .from("buyer_profiles")
    .select("kyc_status, credit_limit_centavos, activated_at")
    .eq("user_id", input.buyerUserId)
    .maybeSingle();
  if (buyerErr) throw new LoanMutationError("db", buyerErr.message);
  if (!buyer) {
    throw new LoanMutationError(
      "validation",
      "Buyer has no buyer profile (buyer capability not unlocked).",
    );
  }
  if (buyer.kyc_status !== "verified" || !buyer.activated_at) {
    throw new LoanMutationError(
      "validation",
      "Buyer is not KYC-verified and activated.",
    );
  }
  if (input.ticketCentavos > buyer.credit_limit_centavos) {
    throw new LoanMutationError(
      "validation",
      `Ticket ${input.ticketCentavos} exceeds buyer credit limit ${buyer.credit_limit_centavos} (centavos).`,
    );
  }

  // Seller must be an activated, verified seller.
  const { data: seller, error: sellerErr } = await supabase
    .from("seller_profiles")
    .select("kyc_status, activated_at")
    .eq("user_id", input.sellerUserId)
    .maybeSingle();
  if (sellerErr) throw new LoanMutationError("db", sellerErr.message);
  if (!seller) {
    throw new LoanMutationError(
      "validation",
      "Seller has no seller profile (seller capability not unlocked).",
    );
  }
  if (seller.kyc_status !== "verified" || !seller.activated_at) {
    throw new LoanMutationError(
      "validation",
      "Seller is not KYC-verified and activated.",
    );
  }

  const interestRateMonthly =
    input.interestRateMonthly ??
    (await getConfigValue("default_interest_rate_monthly", supabase));
  const merchantFeePct =
    input.merchantFeePct ??
    (await getConfigValue("default_merchant_fee_pct", supabase));

  const { data, error } = await supabase
    .rpc("book_loan", {
      p_buyer: input.buyerUserId,
      p_seller: input.sellerUserId,
      p_ticket_centavos: input.ticketCentavos,
      p_tenor_months: input.tenorMonths,
      p_interest_rate_monthly: interestRateMonthly,
      p_merchant_fee_pct: merchantFeePct,
      p_actor: input.actorUserId ?? null,
      p_note: input.note ?? null,
    })
    .single<Loan>();

  if (error) throw new LoanMutationError("db", error.message);
  return data;
}

export type ReleaseEscrowInput = {
  loanId: string;
  actorUserId?: string | null;
  note?: string | null;
};

export type ReleaseEscrowResult = {
  loanId: string;
  grossCentavos: number;
  feeCentavos: number;
  netCentavos: number;
  merchantFeePct: number;
};

/**
 * Release escrow to the seller: transition to `escrow_released`, record the
 * gross release AND the merchant-fee deduction as two audit events, and return
 * the net amount to actually pay the seller. Validates the transition first
 * (escrow_released must be a legal next state) and applies it race-safely.
 */
export async function releaseEscrow(
  input: ReleaseEscrowInput,
): Promise<ReleaseEscrowResult> {
  const supabase = createAdminClient();

  const { data: current, error: readErr } = await supabase
    .from("loans")
    .select("status, seller_user_id")
    .eq("id", input.loanId)
    .maybeSingle();
  if (readErr) throw new LoanMutationError("db", readErr.message);
  if (!current) {
    throw new LoanMutationError("not_found", `Loan ${input.loanId} not found.`);
  }
  if (!isLoanStatus(current.status)) {
    throw new LoanMutationError(
      "db",
      `Loan ${input.loanId} has unknown status "${current.status}".`,
    );
  }

  assertTransition(current.status, "escrow_released");

  const { data, error } = await supabase.rpc("release_escrow", {
    p_loan_id: input.loanId,
    p_from: current.status,
    p_actor: input.actorUserId ?? null,
    p_note: input.note ?? null,
  });

  if (error) {
    if (error.code === "23514") {
      throw new LoanMutationError(
        "conflict",
        `Loan ${input.loanId} was no longer in state "${current.status}".`,
      );
    }
    throw new LoanMutationError("db", error.message);
  }

  // A seller's first COMPLETED order (escrow released to them) qualifies a
  // seller-to-seller referral bounty. No-op when the seller wasn't referred or
  // it already qualified. Never block the release on referral bookkeeping.
  await maybeQualifySellerReferral(supabase, current.seller_user_id).catch(
    (e) => console.error("maybeQualifySellerReferral failed:", e),
  );

  const r = data as {
    gross_centavos: number;
    fee_centavos: number;
    net_centavos: number;
    merchant_fee_pct: number;
  };
  return {
    loanId: input.loanId,
    grossCentavos: r.gross_centavos,
    feeCentavos: r.fee_centavos,
    netCentavos: r.net_centavos,
    merchantFeePct: Number(r.merchant_fee_pct),
  };
}

export type TransitionLoanInput = {
  loanId: string;
  /** Target status. Must be a legal next state from the loan's current status. */
  to: LoanStatus;
  actorUserId?: string | null;
  /** Money figure to record on the audit event, if relevant (centavos). */
  amountCentavos?: number | null;
  note?: string | null;
  /** Override the default audit event_type for this transition. */
  eventType?: EscrowEventType;
};

/**
 * Move a loan to a new status, recording an audit event, atomically.
 *
 * Reads the current status, validates `current -> to` against the state
 * machine (throws InvalidLoanTransitionError if illegal), then applies the
 * change with a compare-and-swap on the current status to stay race-safe.
 */
export async function transitionLoan(
  input: TransitionLoanInput,
): Promise<Loan> {
  const supabase = createAdminClient();

  const { data: current, error: readErr } = await supabase
    .from("loans")
    .select("status")
    .eq("id", input.loanId)
    .maybeSingle();
  if (readErr) throw new LoanMutationError("db", readErr.message);
  if (!current) {
    throw new LoanMutationError("not_found", `Loan ${input.loanId} not found.`);
  }
  if (!isLoanStatus(current.status)) {
    throw new LoanMutationError(
      "db",
      `Loan ${input.loanId} has unknown status "${current.status}".`,
    );
  }

  const from = current.status;

  // Source of truth for transition legality. Throws InvalidLoanTransitionError.
  assertTransition(from, input.to);

  const { data, error } = await supabase
    .rpc("apply_loan_transition", {
      p_loan_id: input.loanId,
      p_from: from,
      p_to: input.to,
      p_event_type: input.eventType ?? STATUS_EVENT_TYPE[input.to],
      p_amount: input.amountCentavos ?? null,
      p_note: input.note ?? null,
      p_actor: input.actorUserId ?? null,
    })
    .single<Loan>();

  if (error) {
    // The CAS guard raises check_violation (code 23514) when the loan is no
    // longer in `from` — i.e. it changed under us.
    if (error.code === "23514") {
      throw new LoanMutationError(
        "conflict",
        `Loan ${input.loanId} was no longer in state "${from}".`,
      );
    }
    throw new LoanMutationError("db", error.message);
  }
  return data;
}

export type StartRepaymentResult = {
  loanId: string;
  installments: number;
  totalCentavos?: number;
};

/**
 * Begin repayment: transition escrow_released -> repaying and generate the
 * installment schedule (once) from the loan's stored ticket/rate/tenor.
 * Validates the transition first, then applies it atomically via RPC.
 */
export async function startRepayment(input: {
  loanId: string;
  actorUserId?: string | null;
}): Promise<StartRepaymentResult> {
  const supabase = createAdminClient();

  const { data: current, error: readErr } = await supabase
    .from("loans")
    .select("status")
    .eq("id", input.loanId)
    .maybeSingle();
  if (readErr) throw new LoanMutationError("db", readErr.message);
  if (!current) {
    throw new LoanMutationError("not_found", `Loan ${input.loanId} not found.`);
  }
  if (!isLoanStatus(current.status)) {
    throw new LoanMutationError(
      "db",
      `Loan ${input.loanId} has unknown status "${current.status}".`,
    );
  }

  assertTransition(current.status, "repaying");

  const { data, error } = await supabase.rpc("start_repayment", {
    p_loan_id: input.loanId,
    p_from: current.status,
    p_actor: input.actorUserId ?? null,
  });
  if (error) {
    if (error.code === "23514") {
      throw new LoanMutationError(
        "conflict",
        `Loan ${input.loanId} was no longer in state "${current.status}".`,
      );
    }
    throw new LoanMutationError("db", error.message);
  }

  const r = data as { installments: number; total_centavos?: number };
  return {
    loanId: input.loanId,
    installments: r.installments,
    totalCentavos: r.total_centavos,
  };
}

export type RecordRepaymentResult = { loanId: string; remaining: number };

/**
 * Record one installment as paid, append a repayment_recorded audit row, and
 * auto-settle the loan once nothing is outstanding. Atomic via RPC.
 */
export async function recordRepayment(input: {
  repaymentId: string;
  actorUserId?: string | null;
}): Promise<RecordRepaymentResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("record_repayment", {
    p_repayment_id: input.repaymentId,
    p_actor: input.actorUserId ?? null,
  });
  if (error) {
    if (error.code === "23514") {
      throw new LoanMutationError(
        "conflict",
        "Repayment not found or already recorded.",
      );
    }
    throw new LoanMutationError("db", error.message);
  }

  const r = data as { loan_id: string; remaining: number };
  return { loanId: r.loan_id, remaining: r.remaining };
}

/**
 * ADMIN OVERRIDE — force a loan into any status, bypassing the state machine.
 * Requires a mandatory reason, recorded as an immutable `admin_override`
 * escrow_event (and mirrored to the audit log). Caller MUST already be
 * confirmed as an admin in the action layer.
 */
export async function adminOverride(input: {
  loanId: string;
  to: LoanStatus;
  reason: string;
  actorUserId: string;
}): Promise<Loan> {
  if (!input.reason.trim()) {
    throw new LoanMutationError(
      "validation",
      "A reason is required for an override.",
    );
  }
  if (!isLoanStatus(input.to)) {
    throw new LoanMutationError("validation", "Unknown target status.");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .rpc("admin_override_transition", {
      p_loan_id: input.loanId,
      p_to: input.to,
      p_reason: input.reason.trim(),
      p_actor: input.actorUserId,
    })
    .single<Loan>();
  if (error) throw new LoanMutationError("db", error.message);

  const { recordAudit } = await import("@/lib/audit/log");
  await recordAudit(supabase, {
    actorUserId: input.actorUserId,
    action: "admin_override",
    entityType: "loan",
    entityId: input.loanId,
    detail: { to: input.to, reason: input.reason.trim() },
  });

  return data;
}
