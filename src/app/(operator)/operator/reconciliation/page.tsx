import {
  listConfirmedPayments,
  ledgerTrialBalance,
} from "@/lib/operator/reconciliation";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Reconciliation: a tape of confirmed payments to tick against the bank/e-wallet
 * statement, plus a ledger trial balance (debits must equal credits) so any
 * drift in the double-entry book surfaces immediately.
 */
export default async function ReconciliationPage() {
  const [{ rows, totalCentavos }, tb] = await Promise.all([
    listConfirmedPayments(30),
    ledgerTrialBalance(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Reconciliation</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Tick each confirmed payment against your GCash/Maya/bank record, and
          check the ledger balances.
        </p>
      </div>

      {/* Ledger trial balance */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Ledger trial balance</h2>
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold ${
              tb.balanced
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {tb.balanced ? "Balanced ✓" : "OUT OF BALANCE"}
          </span>
        </div>
        <table className="w-full max-w-xl text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <th className="py-2 pr-3 font-medium">Account</th>
              <th className="py-2 pr-3 text-right font-medium">Debit</th>
              <th className="py-2 pr-3 text-right font-medium">Credit</th>
              <th className="py-2 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {tb.accounts.map((a) => (
              <tr key={a.account} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-3 font-mono text-xs">{a.account}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(a.debit)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(a.credit)}</td>
                <td className="py-2 text-right tabular-nums">{formatPeso(a.net)}</td>
              </tr>
            ))}
            <tr className="border-t border-black/20 font-semibold">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(tb.totalDebit)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(tb.totalCredit)}</td>
              <td className="py-2 text-right tabular-nums">
                {formatPeso(tb.totalCredit - tb.totalDebit)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Confirmed payments tape */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Confirmed payments — last 30 days ({rows.length})
          </h2>
          <span className="text-sm font-semibold tabular-nums">
            Total {formatPeso(totalCentavos)}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">
            No confirmed payments in the period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                  <th className="py-2 pr-3 font-medium">Confirmed</th>
                  <th className="py-2 pr-3 font-medium">Buyer</th>
                  <th className="py-2 pr-3 font-medium">Method</th>
                  <th className="py-2 pr-3 font-medium">Reference</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-3 whitespace-nowrap text-black/60 dark:text-white/60">
                      {r.confirmed_at ? formatDateTime(r.confirmed_at) : "—"}
                    </td>
                    <td className="py-2 pr-3">{r.buyerName}</td>
                    <td className="py-2 pr-3">{r.method ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.reference_no ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatPeso(r.amount_centavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
