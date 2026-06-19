import Link from "next/link";
import { listLoans } from "@/lib/operator/queries";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LoansListPage() {
  const loans = await listLoans();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Loans ({loans.length})</h1>

      {loans.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">No loans yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Buyer</th>
                <th className="py-2 pr-3 font-medium">Seller</th>
                <th className="py-2 pr-3 text-right font-medium">Ticket</th>
                <th className="py-2 pr-3 text-right font-medium">Tenor</th>
                <th className="py-2 pr-3 text-right font-medium">Fee</th>
                <th className="py-2 pr-3 font-medium">Updated</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-black/5 dark:border-white/5"
                >
                  <td className="py-2 pr-3">
                    <StatusBadge status={l.status} />
                    {l.hasOverride ? (
                      <span className="ml-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        OVERRIDE
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{l.buyerName}</td>
                  <td className="py-2 pr-3">{l.sellerName}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatPeso(l.ticket_centavos)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {l.tenor_months}mo
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {l.merchant_fee_pct}%
                  </td>
                  <td className="py-2 pr-3 text-black/60 dark:text-white/60">
                    {formatDateTime(l.updated_at)}
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/operator/loans/${l.id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      Manage
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
