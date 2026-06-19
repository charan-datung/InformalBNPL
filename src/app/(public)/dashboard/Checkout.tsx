"use client";

import { useState } from "react";
import { computeSchedule } from "@/lib/loans/schedule";
import { formatPeso } from "@/lib/format";
import ScheduleTable from "@/app/(public)/dashboard/ScheduleTable";
import { checkoutAction } from "@/app/(public)/dashboard/actions";
import type { VerifiedSeller } from "@/lib/loans/views";

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
      <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="font-semibold">New purchase</h2>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          No verified sellers are available yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">New purchase</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Credit available: {formatPeso(creditLimitCentavos)}. Interest{" "}
        {(monthlyRate * 100).toFixed(2)}%/mo, applied from system settings.
      </p>

      <form action={checkoutAction} className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-medium">Seller</span>
            <select
              name="seller_user_id"
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              required
              className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            >
              {sellers.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                  {s.socialHandle ? ` (${s.socialHandle})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Amount (PHP)</span>
            <input
              type="number"
              name="amount_pesos"
              min={1}
              step="1"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Tenor (months)</span>
            <input
              type="number"
              name="tenor_months"
              min={1}
              max={24}
              step="1"
              required
              value={tenor}
              onChange={(e) => setTenor(Number(e.target.value))}
              className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </label>
        </div>

        {/* Live schedule preview */}
        {ticketCentavos > 0 && tenor > 0 ? (
          <div className="rounded-md border border-black/10 p-3 dark:border-white/10">
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium">Your repayment schedule</span>
              <span className="text-black/60 dark:text-white/60">
                Total to repay{" "}
                <span className="font-semibold text-black dark:text-white">
                  {formatPeso(schedule.totalCentavos)}
                </span>{" "}
                ({formatPeso(schedule.interestCentavos)} interest)
              </span>
            </div>
            {/* Dates shown here are estimates from today; finalised when
                repayment begins. */}
            <ScheduleTable installments={schedule.installments} />
            <p className="mt-1 text-[11px] text-black/40 dark:text-white/40">
              Due dates are estimated from today and finalise when repayment
              begins.
            </p>
          </div>
        ) : null}

        {overLimit ? (
          <p className="text-sm text-red-600">
            Amount exceeds your credit limit of {formatPeso(creditLimitCentavos)}.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canConfirm}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-white dark:text-slate-900"
        >
          Confirm purchase
        </button>
        <p className="text-[11px] text-black/40 dark:text-white/40">
          Confirming holds the item in escrow. The app records state only — no
          money moves here.
        </p>
      </form>
    </section>
  );
}
