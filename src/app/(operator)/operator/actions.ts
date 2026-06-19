"use server";

import { requireStaff } from "@/lib/auth/staff";
import {
  bookLoan,
  transitionLoan,
  type BookLoanInput,
  type TransitionLoanInput,
  type Loan,
} from "@/lib/loans/mutations";

/**
 * Server actions are the auth-gated entry point to loan mutations for the
 * operator UI. They confirm the caller is staff, stamp the actor, then delegate
 * to the trusted mutation core. (A login flow is still pending; until then the
 * dev route handler at /api/dev/exercise-loan can drive the same core without a
 * session.)
 */

export async function bookLoanAction(
  input: Omit<BookLoanInput, "actorUserId">,
): Promise<Loan> {
  const staff = await requireStaff();
  return bookLoan({ ...input, actorUserId: staff.id });
}

export async function transitionLoanAction(
  input: Omit<TransitionLoanInput, "actorUserId">,
): Promise<Loan> {
  const staff = await requireStaff();
  return transitionLoan({ ...input, actorUserId: staff.id });
}
