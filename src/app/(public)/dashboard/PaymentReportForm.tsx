"use client";

import { useFormStatus } from "react-dom";
import { Loader2, ReceiptText } from "lucide-react";
import { reportPaymentAction } from "@/app/(public)/dashboard/actions";
import { Field, TextInput, Select } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";

/**
 * "I've paid — submit my reference" — lets a buyer report a payment (reference #,
 * amount, method) so the operator confirms against evidence instead of marking
 * it paid blind. Partial amounts are fine; the server allocates oldest-first.
 */
export default function PaymentReportForm({
  loanId,
  suggestedPesos,
}: {
  loanId: string;
  suggestedPesos: number;
}) {
  return (
    <details className="group border-t border-black/5 pt-3">
      <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
        <ReceiptText className="size-3.5" /> I&apos;ve paid — submit my reference
      </summary>
      <form action={reportPaymentAction} className="mt-3 space-y-3">
        <input type="hidden" name="loanId" value={loanId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount paid (PHP)">
            <TextInput
              type="number"
              name="amount_pesos"
              min={1}
              step="1"
              required
              inputMode="numeric"
              defaultValue={suggestedPesos > 0 ? suggestedPesos : undefined}
            />
          </Field>
          <Field label="How you paid">
            <Select name="method" defaultValue="gcash">
              <option value="gcash">GCash</option>
              <option value="maya">Maya</option>
              <option value="bank">Bank transfer</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </div>
        <Field
          label="Reference number"
          hint="The reference / transaction number on your receipt."
        >
          <TextInput
            type="text"
            name="reference_no"
            required
            maxLength={64}
            placeholder="e.g. 1234567890"
          />
        </Field>
        <Submit />
        <p className="text-[11px] text-black/45">
          Your operator confirms it against your reference, then your plan
          updates. Partial payments are fine.
        </p>
      </form>
    </details>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClasses({ variant: "secondary", size: "sm" })}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Submitting…
        </>
      ) : (
        "Submit payment reference"
      )}
    </button>
  );
}
