import { getConfig, type ConfigKey } from "@/lib/config/system-config";
import { getCurrentStaff } from "@/lib/auth/staff";
import { updateConfigAction } from "@/app/(operator)/operator/actions";

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
  {
    key: "default_credit_limit_centavos",
    label: "Default credit limit (centavos)",
    hint: "centavos, e.g. 5000000 = ₱50,000",
  },
];

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [config, staff] = await Promise.all([getConfig(), getCurrentStaff()]);
  const isAdmin = staff?.staff_role === "admin";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">System config</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        These values are the defaults used across the app. Editing is{" "}
        <strong>admin-only</strong>; every change is recorded in the audit log.
      </p>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {!isAdmin ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          You are signed in as an operator — values are read-only. Saving
          requires an admin.
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
                disabled={!isAdmin}
                className="mt-1 w-48 rounded-md border border-black/15 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/15 dark:bg-transparent"
              />
            </label>
            <button
              type="submit"
              disabled={!isAdmin}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 dark:bg-white dark:text-slate-900"
            >
              Save
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
