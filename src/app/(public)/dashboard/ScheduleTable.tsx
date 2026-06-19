import type { Installment } from "@/lib/loans/schedule";
import { formatPeso } from "@/lib/format";

/**
 * Dense repayment schedule table — principal + interest + total per installment
 * with due dates. Pure/presentational, used both in the checkout preview
 * (client) and on active loans (server).
 */
export default function ScheduleTable({
  installments,
  showDates = true,
}: {
  installments: Installment[];
  showDates?: boolean;
}) {
  if (installments.length === 0) return null;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
          <th className="py-1.5 pr-3 font-medium">#</th>
          {showDates ? <th className="py-1.5 pr-3 font-medium">Due</th> : null}
          <th className="py-1.5 pr-3 text-right font-medium">Principal</th>
          <th className="py-1.5 pr-3 text-right font-medium">Interest</th>
          <th className="py-1.5 text-right font-medium">Amount due</th>
        </tr>
      </thead>
      <tbody>
        {installments.map((r) => (
          <tr key={r.index} className="border-b border-black/5 dark:border-white/5">
            <td className="py-1.5 pr-3 text-black/50 dark:text-white/50">
              {r.index}
            </td>
            {showDates ? (
              <td className="py-1.5 pr-3 tabular-nums">{r.dueDate}</td>
            ) : null}
            <td className="py-1.5 pr-3 text-right tabular-nums">
              {formatPeso(r.principalCentavos)}
            </td>
            <td className="py-1.5 pr-3 text-right tabular-nums text-black/50 dark:text-white/50">
              {formatPeso(r.interestCentavos)}
            </td>
            <td className="py-1.5 text-right font-medium tabular-nums">
              {formatPeso(r.amountCentavos)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
