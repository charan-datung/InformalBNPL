import Link from "next/link";
import { getConfig } from "@/lib/config/system-config";
import { formatPeso } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Read-only system config for operators. Editing lives in the admin portal
 * (/admin/config) — operators see the values that drive the app but can't
 * change them.
 */
export default async function ConfigPage() {
  const config = await getConfig();

  const rows: [string, string][] = [
    [
      "Default interest rate (monthly)",
      `${(config.default_interest_rate_monthly * 100).toFixed(2)}%`,
    ],
    ["Default merchant fee", `${config.default_merchant_fee_pct}%`],
    ["Default rolling reserve", `${config.default_reserve_pct}%`],
    ["Dispute window", `${config.dispute_window_days} days`],
    ["Auto-release window", `${config.auto_release_days} days`],
    ["Default tenor", `${config.default_tenor_months} months`],
    ["Seller payout window", `${config.seller_payout_days} days`],
    ["Default credit limit", formatPeso(config.default_credit_limit_centavos)],
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">System config</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        These values drive the app. Editing is in the{" "}
        <Link href="/admin/config" className="underline underline-offset-4">
          admin portal
        </Link>{" "}
        (admin only).
      </p>
      <table className="w-full max-w-md text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr
              key={k}
              className="border-b border-black/5 dark:border-white/5"
            >
              <td className="py-1.5 pr-4 text-black/60 dark:text-white/60">
                {k}
              </td>
              <td className="py-1.5 text-right font-medium tabular-nums">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
