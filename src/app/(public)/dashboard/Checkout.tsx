"use client";

import { useState } from "react";
import { computeSchedule } from "@/lib/loans/schedule";
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
  defaultTenor,
  creditLimitCentavos,
}: {
  sellers: VerifiedSeller[];
  monthlyRate: number;
  defaultTenor: number;
  creditLimitCentavos: number;
}) {
  const [seller, setSeller] = useState(sellers[0]?.userId ?? "");
  const [amount, setAmount] = useState<string>("");
  const [tenor, setTenor] = useState<number>(defaultTenor);

  const amountPesos = Number(amount);
  const ticketCentavos =
    Number.isFinite(amountPesos) && amountPesos > 0
      ? Math.round(amountPesos * 100)
      : 0;
  const schedule = computeSchedule(ticketCentavos, tenor, monthlyRate);
  const overLimit = ticketCentavos > creditLimitCentavos;
  const canConfirm = !!seller && ticketCentavos > 0 && tenor > 0 && !overLimit;

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
          Credit available: {formatPeso(creditLimitCentavos)}. Interest{" "}
          {(monthlyRate * 100).toFixed(2)}%/mo, applied from system settings.
        </p>
      </div>

      <form action={checkoutAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Seller" className="sm:col-span-2">
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
          <Field label="Tenor (months)">
            <TextInput
              type="number"
              name="tenor_months"
              min={1}
              max={24}
              step="1"
              required
              value={tenor}
              onChange={(e) => setTenor(Number(e.target.value))}
            />
          </Field>
        </div>

        {/* Live schedule preview */}
        {ticketCentavos > 0 && tenor > 0 ? (
          <div className="rounded-xl border border-black/10 bg-black/[0.015] p-3">
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium">Your repayment schedule</span>
              <span className="text-black/55">
                Total to repay{" "}
                <span className="font-semibold text-foreground">
                  {formatPeso(schedule.totalCentavos)}
                </span>{" "}
                ({formatPeso(schedule.interestCentavos)} interest)
              </span>
            </div>
            {/* Dates shown here are estimates from today; finalised when
                repayment begins. */}
            <ScheduleTable installments={schedule.installments} />
            <p className="mt-1 text-[11px] text-black/40">
              Due dates are estimated from today and finalise when repayment
              begins.
            </p>
          </div>
        ) : null}

        {overLimit ? (
          <Callout tone="error">
            Amount exceeds your credit limit of {formatPeso(creditLimitCentavos)}.
          </Callout>
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
          Confirming holds the item in escrow. The app records state only — no
          money moves here.
        </p>
      </form>
    </Card>
  );
}
