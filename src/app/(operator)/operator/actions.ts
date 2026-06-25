"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import {
  transitionLoan,
  releaseEscrow,
  startRepayment,
  recordRepayment,
} from "@/lib/loans/mutations";
import { isLoanStatus } from "@/lib/loans/state-machine";
import { reviewBuyer, reviewSeller } from "@/lib/profiles/review";
import { getConfigValue } from "@/lib/config/system-config";
import { formatPeso } from "@/lib/format";
import { resolveDispute } from "@/lib/disputes/mutations";
import {
  proposePayout,
  approvePayout,
  rejectPayout,
} from "@/lib/payouts/payouts";
import { markReferralPaid } from "@/lib/referrals/seller-referrals";

/**
 * Auth-gated operator actions. Each confirms the caller is staff, stamps the
 * actor server-side (never trusted from the client), runs the mutation, and
 * redirects back — with ?error=… on failure so the page can show it. Every
 * loan state change writes an append-only escrow_events row via the mutation
 * core; nothing here deletes anything.
 */

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
}

export async function transitionLoanAction(formData: FormData) {
  const staff = await requireStaff();
  const loanId = String(formData.get("loanId") ?? "");
  const to = String(formData.get("to") ?? "");
  // Optional return path (e.g. the releases queue); defaults to the loan detail.
  const redirectTo = String(formData.get("redirectTo") ?? "");
  const back =
    redirectTo === "/operator/releases"
      ? "/operator/releases"
      : `/operator/loans/${loanId}`;

  if (!isLoanStatus(to)) {
    redirect(`${back}?error=${encodeURIComponent("Unknown target status.")}`);
  }

  try {
    // Two transitions are special-cased:
    //  - escrow_released also records the merchant-fee deduction + net.
    //  - repaying also generates the installment schedule.
    if (to === "escrow_released") {
      await releaseEscrow({ loanId, actorUserId: staff.id });
    } else if (to === "repaying") {
      await startRepayment({ loanId, actorUserId: staff.id });
    } else {
      await transitionLoan({ loanId, to, actorUserId: staff.id });
    }
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(back);
}

export async function recordRepaymentAction(formData: FormData) {
  const staff = await requireStaff();
  const repaymentId = String(formData.get("repaymentId") ?? "");
  const loanId = String(formData.get("loanId") ?? "");
  const back = `/operator/loans/${loanId}`;

  try {
    await recordRepayment({ repaymentId, actorUserId: staff.id });
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(back);
}

export async function reviewBuyerAction(formData: FormData) {
  const staff = await requireStaff();
  const back = "/operator/reviews/buyers";

  const userId = String(formData.get("userId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const creditLimitPesos = Number(formData.get("credit_limit_pesos") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (decision !== "approve" && decision !== "reject") {
    redirect(`${back}?error=${encodeURIComponent("Invalid decision.")}`);
  }

  // Hard ceiling on what an operator can approve a buyer at. Validated here so
  // the operator gets a clear message; reviewBuyer also clamps as a backstop.
  const maxLimitCentavos = await getConfigValue("max_credit_limit_centavos");
  if (
    decision === "approve" &&
    Math.round(creditLimitPesos * 100) > maxLimitCentavos
  ) {
    redirect(
      `${back}?error=${encodeURIComponent(
        `Credit limit cannot exceed ${formatPeso(maxLimitCentavos)}.`,
      )}`,
    );
  }

  try {
    await reviewBuyer({
      userId,
      decision: decision as "approve" | "reject",
      creditLimitCentavos: Math.round(creditLimitPesos * 100),
      notes,
      actorUserId: staff.id,
    });
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(back);
}

export async function reviewSellerAction(formData: FormData) {
  const staff = await requireStaff();
  const back = "/operator/reviews/sellers";

  const userId = String(formData.get("userId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const trustTier = String(formData.get("trust_tier") ?? "new");
  const reservePct = Number(formData.get("reserve_pct") ?? 0);
  const capPesos = Number(formData.get("max_outstanding_pesos") ?? NaN);
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (decision !== "approve" && decision !== "reject") {
    redirect(`${back}?error=${encodeURIComponent("Invalid decision.")}`);
  }

  try {
    await reviewSeller({
      userId,
      decision: decision as "approve" | "reject",
      trustTier: trustTier === "trusted" ? "trusted" : "new",
      reservePct,
      maxOutstandingCentavos: Number.isFinite(capPesos)
        ? Math.round(capPesos * 100)
        : undefined,
      notes,
      actorUserId: staff.id,
    });
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(back);
}

// ---- Maker-checker seller payouts ----

export async function proposePayoutAction(formData: FormData) {
  const staff = await requireStaff();
  const back = "/operator/payouts";
  const sellerUserId = String(formData.get("seller_user_id") ?? "");
  const amountPesos = Number(formData.get("amount_pesos") ?? NaN);
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!Number.isFinite(amountPesos) || amountPesos <= 0) {
    redirect(`${back}?error=${encodeURIComponent("Enter a valid amount.")}`);
  }
  try {
    await proposePayout({
      sellerUserId,
      amountCentavos: Math.round(amountPesos * 100),
      makerUserId: staff.id,
      note,
    });
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(back);
}

export async function decidePayoutAction(formData: FormData) {
  const staff = await requireStaff();
  const back = "/operator/payouts";
  const payoutId = String(formData.get("payoutId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  try {
    if (decision === "approve") {
      await approvePayout({ payoutId, checkerUserId: staff.id });
    } else if (decision === "reject") {
      await rejectPayout({ payoutId, checkerUserId: staff.id, note });
    } else {
      redirect(`${back}?error=${encodeURIComponent("Invalid decision.")}`);
    }
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(back);
}

export async function resolveDisputeAction(formData: FormData) {
  const staff = await requireStaff();
  const back = "/operator/disputes";

  const disputeId = String(formData.get("disputeId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (outcome !== "buyer" && outcome !== "seller") {
    redirect(`${back}?error=${encodeURIComponent("Invalid outcome.")}`);
  }

  try {
    await resolveDispute({
      disputeId,
      outcome: outcome as "buyer" | "seller",
      note,
      actorUserId: staff.id,
    });
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(back);
}

/** Settle a qualified seller-referral bounty (operator pays out off-platform). */
export async function markReferralPaidAction(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const back = "/operator/referrals";
  if (!id) redirect(`${back}?error=${encodeURIComponent("Missing referral id.")}`);
  try {
    await markReferralPaid(id);
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent(errorMessage(e))}`);
  }
  redirect(back);
}
