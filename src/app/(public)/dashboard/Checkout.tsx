"use client";

import { useState } from "react";
import { type PaymentFrequency } from "@/lib/loans/schedule";
import { computeLoanTerms } from "@/lib/loans/finance";
import DisclosureAcknowledgment from "@/components/legal/DisclosureAcknowledgment";
import { formatPeso } from "@/lib/format";
import ScheduleTable from "@/app/(public)/dashboard/ScheduleTable";
import { checkoutAction } from "@/app/(public)/dashboard/actions";
import type { VerifiedSeller } from "@/lib/loans/views";
import Card from "@/components/ui/Card";
import Callout from "@/components/ui/Callout";
import { Field, TextInput, Select } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";

/**
 * Buyer checkout. Pick a seller, enter amount + tenor (tenor defaults from
 * system_config), and see the FULL repayment schedule — principal + interest +
 * due dates — live, before confirming. The schedule uses the same math as the
 * server's start_repayment so the preview matches what's generated later.
 *
 * Confirming books the loan and immediately moves it to escrow_held.
 */
export default function Checkout({
  sellers,
  monthlyRate,
  processingFeePct,
  penaltyRateMonthly,
  defaultTenor,
  maxTenor,
  creditLimitCentavos,
}: {
  sellers: VerifiedSeller[];
  monthlyRate: number;
  processingFeePct: number;
  penaltyRateMonthly: number;
  defaultTenor: number;
  maxTenor: number;
  creditLimitCentavos: number;
}) {
  const [seller, setSeller] = useState(sellers[0]?.userId ?? "");
  const [amount, setAmount] = useState<string>("");
  const [tenor, setTenor] = useState<number>(Math.min(defaultTenor, maxTenor));
  const [frequency, setFrequency] = useState<PaymentFrequency>("monthly");

  const amountPesos = Number(amount);
  const ticketCentavos =
    Number.isFinite(amountPesos) && amountPesos > 0
      ? Math.round(amountPesos * 100)
      : 0;
  const terms = computeLoanTerms({
    principalCentavos: ticketCentavos,
    tenorMonths: tenor,
    interestRateMonthly: monthlyRate,
    frequency,
    processingFeePct,
    penaltyRateMonthly,
  });
  const overLimit = ticketCentavos > creditLimitCentavos;
  const canConfirm = !!seller && ticketCentavos > 0 && tenor > 0 && !overLimit;
  const tenorOptions = Array.from({ length: maxTenor }, (_, i) => i + 1);

  if (sellers.length === 0) {
    return (
      <Card>
        <h2 className="font-semibold">New purchase</h2>
        <p className="mt-1 text-sm text-black/55">
          No verified sellers are available yet.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">New purchase</h2>
        <p className="text-xs text-black/50">
          Available to spend: {formatPeso(creditLimitCentavos)}. Small fee of{" "}
          {(monthlyRate * 100).toFixed(2)}% per month, added to each payment.
        </p>
      </div>

      <form action={checkoutAction} className="space-y-4">
        <input type="hidden" name="payment_frequency" value={frequency} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Seller">
            <Select
              name="seller_user_id"
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              required
            >
              {sellers.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                  {s.socialHandle ? ` (${s.socialHandle})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (PHP)">
            <TextInput
              type="number"
              name="amount_pesos"
              min={1}
              step="1"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Pay over">
            <Select
              name="tenor_months"
              value={tenor}
              onChange={(e) => setTenor(Number(e.target.value))}
              required
            >
              {tenorOptions.map((m) => (
                <option key={m} value={m}>
                  {m} {m === 1 ? "month" : "months"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How often">
            <Select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as PaymentFrequency)}
            >
              <option value="monthly">Monthly</option>
              <option value="biweekly">Every 2 weeks</option>
            </Select>
          </Field>
        </div>

        {/* Live schedule preview */}
        {ticketCentavos > 0 && tenor > 0 ? (
          <div className="rounded-xl border border-black/10 bg-black/[0.015] p-3">
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium">Your payment plan</span>
              <span className="text-black/55">
                Total{" "}
                <span className="font-semibold text-foreground">
                  {formatPeso(terms.totalPayableCentavos)}
                </span>{" "}
                ({formatPeso(terms.financeChargeCentavos)} interest + fees)
              </span>
            </div>
            {/* Dates shown here are estimates from today; finalised when
                repayment begins. */}
            <ScheduleTable installments={terms.installments} />
            <p className="mt-1 text-[11px] text-black/40">
              Payment dates are estimated from today and are finalised once your
              order is confirmed.
            </p>
          </div>
        ) : null}

        <fieldset className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["ship", "Ship to me", "Seller ships it; pay back over time.", true],
              [
                "in_person",
                "Pick up in person",
                "You'll get a code to give the seller on hand-over.",
                false,
              ],
            ] as [string, string, string, boolean][]
          ).map(([value, label, desc, checked]) => (
            <label
              key={value}
              className="group flex cursor-pointer items-start gap-2 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
            >
              <input
                type="radio"
                name="fulfillment"
                value={value}
                defaultChecked={checked}
                className="mt-0.5 accent-brand-600"
              />
              <span>
                <span className="block font-medium text-foreground">{label}</span>
                <span className="block text-xs text-black/50">{desc}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {overLimit ? (
          <Callout tone="error">
            That&apos;s more than you can spend right now (
            {formatPeso(creditLimitCentavos)}). Try a smaller amount or pay down
            what you owe first.
          </Callout>
        ) : null}

        {ticketCentavos > 0 && !overLimit ? (
          <DisclosureAcknowledgment terms={terms} />
        ) : null}

        <button
          type="submit"
          disabled={!canConfirm}
          className={buttonClasses({
            size: "lg",
            className: "w-full sm:w-auto",
          })}
        >
          Confirm purchase
        </button>
        <p className="text-[11px] text-black/40">
          When you confirm, we set up your installment plan and keep your order&apos;s
          payment safe until it arrives. Datung is operated by Dark Knight Lending
          Inc., an SEC-registered lending company.
        </p>
      </form>
    </Card>
  );
}
