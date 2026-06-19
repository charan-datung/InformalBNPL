import { NextResponse } from "next/server";
import { bookLoan, transitionLoan, LoanMutationError } from "@/lib/loans/mutations";
import { InvalidLoanTransitionError, type LoanStatus } from "@/lib/loans/state-machine";

/**
 * DEV-ONLY harness that drives the server-side loan mutation path end to end,
 * using the seed users (no login required). Books a loan, walks it through the
 * happy path, then proves an illegal transition is rejected.
 *
 *   curl -X POST http://localhost:3000/api/dev/exercise-loan
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in the environment and the seed data
 * (supabase/seed.sql) applied. Returns 404 in production.
 */

export const dynamic = "force-dynamic";

// Seed UUIDs from supabase/seed.sql.
const BUYER = "33333333-3333-3333-3333-333333333333"; // buyer-only
const SELLER = "44444444-4444-4444-4444-444444444444"; // seller-only
const OPERATOR = "22222222-2222-2222-2222-222222222222"; // actor

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const trace: { step: string; status: LoanStatus }[] = [];

  try {
    const ticketCentavos = 1_500_000; // ₱15,000.00

    const loan = await bookLoan({
      buyerUserId: BUYER,
      sellerUserId: SELLER,
      ticketCentavos,
      tenorMonths: 3,
      actorUserId: OPERATOR,
      note: "Exercise harness booking",
    });
    trace.push({ step: "book", status: loan.status });

    // Happy path: booked -> ... -> settled.
    const steps: { to: LoanStatus; amountCentavos?: number }[] = [
      { to: "escrow_held", amountCentavos: ticketCentavos },
      { to: "shipped" },
      { to: "delivered_confirmed" },
      { to: "escrow_released", amountCentavos: ticketCentavos },
      { to: "repaying" },
      { to: "settled" },
    ];

    for (const s of steps) {
      const updated = await transitionLoan({
        loanId: loan.id,
        to: s.to,
        actorUserId: OPERATOR,
        amountCentavos: s.amountCentavos ?? null,
      });
      trace.push({ step: `-> ${s.to}`, status: updated.status });
    }

    // Prove the validator rejects an illegal transition (settled is terminal).
    let rejected: { attempt: string; error: string } | null = null;
    try {
      await transitionLoan({ loanId: loan.id, to: "shipped" });
    } catch (e) {
      if (e instanceof InvalidLoanTransitionError) {
        rejected = { attempt: "settled -> shipped", error: e.message };
      } else {
        throw e;
      }
    }

    return NextResponse.json({
      ok: true,
      loanId: loan.id,
      trace,
      rejectedIllegalTransition: rejected,
    });
  } catch (e) {
    const status = e instanceof LoanMutationError ? 400 : 500;
    const code = e instanceof LoanMutationError ? e.code : "error";
    return NextResponse.json(
      {
        ok: false,
        code,
        error: e instanceof Error ? e.message : "Unknown error",
        traceSoFar: trace,
      },
      { status },
    );
  }
}
