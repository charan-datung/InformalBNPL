"use client";

import { useState } from "react";
import { computeSchedule } from "@/lib/loans/schedule";
import { formatPeso } from "@/lib/format";
import ScheduleTable from "@/app/(public)/dashboard/ScheduleTable";
import { authorizeChargeAction } from "@/app/(public)/charge/actions";

/**
 * Buyer's one-tap confirm. The amount is locked by the seller; the buyer only
 * picks a repayment plan and sees the exact schedule before authorizing.
 */
export default function PayConfirm({
  token,
  amountCentavos,
  monthlyRate,
  defaultTenor,
  maxTenor,
  availableCentavos,
}: {
  token: string;
  amountCentavos: number;
  monthlyRate: number;
  defaultTenor: number;
  maxTenor: number;
  availableCentavos: number;
}) {
  const [tenor, setTenor] = useState(Math.min(defaultTenor, maxTenor));
  const schedule = computeSchedule(amountCentavos, tenor, monthlyRate);
  const overLimit = amountCentavos > availableCentavos;

  if (overLimit) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        This is more than your available credit ({formatPeso(availableCentavos)}).
        Pay down a loan and try again.
      </p>
    );
  }

  return (
    <form action={authorizeChargeAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="tenor_months" value={tenor} />

      <label className="block space-y-1">
        <span className="text-sm font-medium">Repayment plan</span>
        <select
          value={tenor}
          onChange={(e) => setTenor(Number(e.target.value))}
          className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
        >
          {Array.from({ length: maxTenor }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m} {m === 1 ? "month" : "months"}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-md border border-black/10 p-3 dark:border-white/10">
        <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
          <span className="font-medium">Your schedule</span>
          <span className="text-black/60 dark:text-white/60">
            Total{" "}
            <span className="font-semibold text-black dark:text-white">
              {formatPeso(schedule.totalCentavos)}
            </span>{" "}
            ({formatPeso(schedule.interestCentavos)} interest)
          </span>
        </div>
        <ScheduleTable installments={schedule.installments} />
      </div>

      <button
        type="submit"
        className="w-full rounded-md bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
      >
        Authorize {formatPeso(amountCentavos)}
      </button>
      <p className="text-center text-[11px] text-black/40 dark:text-white/40">
        Authorizing draws on your Datung credit line. No money moves in this pilot.
      </p>
    </form>
  );
}
