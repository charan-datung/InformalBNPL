import Link from "next/link";
import { getOperatorCounts } from "@/lib/operator/queries";
import { getConfig } from "@/lib/config/system-config";
import { formatPeso } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OperatorOverviewPage() {
  const [counts, config] = await Promise.all([getOperatorCounts(), getConfig()]);

  const cards = [
    { label: "Loans", value: counts.loans, href: "/operator/loans" },
    {
      label: "Pending buyers",
      value: counts.pendingBuyers,
      href: "/operator/reviews/buyers",
    },
    {
      label: "Pending sellers",
      value: counts.pendingSellers,
      href: "/operator/reviews/sellers",
    },
    {
      label: "Open disputes",
      value: counts.openDisputes,
      href: "/operator/disputes",
    },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Overview</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-lg border border-black/10 p-4 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]"
          >
            <div className="text-2xl font-semibold tabular-nums">{c.value}</div>
            <div className="text-xs text-black/60 dark:text-white/60">
              {c.label}
            </div>
          </Link>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          System config (used as defaults — editable in admin)
        </h2>
        <table className="w-full max-w-md text-sm">
          <tbody>
            <ConfigRow
              k="Default interest rate (monthly)"
              v={`${(config.default_interest_rate_monthly * 100).toFixed(2)}%`}
            />
            <ConfigRow
              k="Default merchant fee"
              v={`${config.default_merchant_fee_pct}%`}
            />
            <ConfigRow
              k="Default rolling reserve"
              v={`${config.default_reserve_pct}%`}
            />
            <ConfigRow
              k="Dispute window"
              v={`${config.dispute_window_days} days`}
            />
            <ConfigRow
              k="Auto-release window"
              v={`${config.auto_release_days} days`}
            />
            <ConfigRow
              k="Default credit limit"
              v={formatPeso(config.default_credit_limit_centavos)}
            />
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ConfigRow({ k, v }: { k: string; v: string }) {
  return (
    <tr className="border-b border-black/5 dark:border-white/5">
      <td className="py-1.5 pr-4 text-black/60 dark:text-white/60">{k}</td>
      <td className="py-1.5 text-right font-medium tabular-nums">{v}</td>
    </tr>
  );
}
