import Link from "next/link";
import { listCollections } from "@/lib/operator/collections";
import { formatPeso } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Collections worklist — overdue installments, most-overdue first, with the
 * buyer's contact so the operator can call/message them today. The reminder cron
 * escalates emails automatically; this is the human follow-up surface.
 */
export default async function CollectionsPage() {
  const { items, totalOverdueCentavos } = await listCollections();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Collections ({items.length})</h1>
        <span className="text-sm font-semibold tabular-nums">
          Total overdue {formatPeso(totalOverdueCentavos)}
        </span>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60">
        Overdue installments, most overdue first. Buyers are also emailed on an
        escalating schedule automatically.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          Nothing overdue. 🎉
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                <th className="py-2 pr-3 font-medium">Days late</th>
                <th className="py-2 pr-3 font-medium">Buyer</th>
                <th className="py-2 pr-3 font-medium">Contact</th>
                <th className="py-2 pr-3 font-medium">Due</th>
                <th className="py-2 pr-3 text-right font-medium">Amount</th>
                <th className="py-2 pr-3 text-right font-medium">Penalty</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr
                  key={i.repaymentId}
                  className="border-b border-black/5 dark:border-white/5"
                >
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                        i.daysLate >= 14
                          ? "bg-red-200 text-red-900"
                          : i.daysLate >= 7
                            ? "bg-amber-200 text-amber-900"
                            : "bg-black/10 text-black/70 dark:bg-white/10 dark:text-white/70"
                      }`}
                    >
                      {i.daysLate}d
                    </span>
                  </td>
                  <td className="py-2 pr-3">{i.buyerName}</td>
                  <td className="py-2 pr-3 tabular-nums">{i.buyerContact ?? "—"}</td>
                  <td className="py-2 pr-3 tabular-nums">{i.dueDate}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatPeso(i.amountCentavos)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-red-600">
                    {i.penaltyCentavos > 0 ? formatPeso(i.penaltyCentavos) : "—"}
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/operator/loans/${i.loanId}`}
                      className="font-medium underline underline-offset-4"
                    >
                      Loan
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
