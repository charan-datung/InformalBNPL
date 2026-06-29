import Link from "next/link";
import { listLoans } from "@/lib/operator/queries";
import { LOAN_STATUSES } from "@/lib/loans/state-machine";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function LoansListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;

  const { rows, total, limit } = await listLoans({
    search: q,
    status,
    limit: PAGE_SIZE,
    offset,
  });

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + rows.length, total);
  const hasPrev = pageNum > 1;
  const hasNext = offset + limit < total;
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (status) u.set("status", status);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Loans ({total})</h1>

      {/* Search + filter */}
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">Search buyer / seller / loan id</span>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="e.g. Maria, or a loan id"
            className="w-64 rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">Status</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
          >
            <option value="">All</option>
            {LOAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
        >
          Search
        </button>
        {q || status ? (
          <Link
            href="/operator/loans"
            className="px-2 py-1.5 text-sm text-black/50 underline underline-offset-4 dark:text-white/50"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No loans match.
        </p>
      ) : (
        <>
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
                {rows.map((l) => (
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

          <div className="flex items-center justify-between text-sm">
            <span className="text-black/50 dark:text-white/50">
              Showing {from}–{to} of {total}
            </span>
            <div className="flex gap-2">
              {hasPrev ? (
                <Link
                  href={`/operator/loans${qs(pageNum - 1)}`}
                  className="rounded-md border border-black/15 px-3 py-1.5 dark:border-white/15"
                >
                  ← Prev
                </Link>
              ) : null}
              {hasNext ? (
                <Link
                  href={`/operator/loans${qs(pageNum + 1)}`}
                  className="rounded-md border border-black/15 px-3 py-1.5 dark:border-white/15"
                >
                  Next →
                </Link>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
