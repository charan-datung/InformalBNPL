import { requireAdminOrRedirect } from "@/lib/auth/staff";
import { getConfig, type ConfigKey } from "@/lib/config/system-config";
import { updateConfigAction } from "@/app/(admin)/admin/actions";

export const dynamic = "force-dynamic";

const FIELDS: { key: ConfigKey; label: string; hint: string }[] = [
  {
    key: "default_interest_rate_monthly",
    label: "Default interest rate (monthly)",
    hint: "decimal, e.g. 0.035 = 3.5%/mo",
  },
  {
    key: "default_merchant_fee_pct",
    label: "Default merchant fee %",
    hint: "whole percent, e.g. 5 = 5%",
  },
  {
    key: "default_reserve_pct",
    label: "Default rolling reserve %",
    hint: "whole percent, e.g. 10 = 10%",
  },
  { key: "dispute_window_days", label: "Dispute window (days)", hint: "integer" },
  {
    key: "auto_release_days",
    label: "Auto-release window (days)",
    hint: "integer",
  },
  { key: "default_tenor_months", label: "Default tenor (months)", hint: "integer" },
  { key: "max_tenor_months", label: "Max tenor (months)", hint: "integer, longest plan a buyer can pick" },
  {
    key: "seller_payout_days",
    label: "Seller payout window (days)",
    hint: "days after escrow release",
  },
  {
    key: "default_credit_limit_centavos",
    label: "Default credit limit (centavos)",
    hint: "centavos, e.g. 500000 = ₱5,000",
  },
];

export default async function AdminConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminOrRedirect();
  const { error } = await searchParams;
  const config = await getConfig();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">System configuration</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        These values drive the whole app. Every change records who and when (see
        the audit log).
      </p>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        {FIELDS.map((f) => (
          <form
            key={f.key}
            action={updateConfigAction}
            className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10"
          >
            <input type="hidden" name="key" value={f.key} />
            <label className="flex-1 space-y-1">
              <span className="text-sm font-medium">{f.label}</span>
              <span className="block text-xs text-black/40 dark:text-white/40">
                {f.hint}
              </span>
              <input
                type="number"
                name="value"
                step="any"
                defaultValue={config[f.key]}
                className="mt-1 w-48 rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
            >
              Save
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
