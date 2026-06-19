import { listPendingBuyers } from "@/lib/operator/queries";
import { reviewBuyerAction } from "@/app/(operator)/operator/actions";
import { getConfig } from "@/lib/config/system-config";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BuyerReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [buyers, config] = await Promise.all([listPendingBuyers(), getConfig()]);

  // Default credit limit prefilled from system_config (pesos).
  const defaultLimitPesos = config.default_credit_limit_centavos / 100;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        Pending buyer applications ({buyers.length})
      </h1>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {buyers.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No pending buyer applications.
        </p>
      ) : (
        <div className="space-y-4">
          {buyers.map((b) => (
            <form
              key={b.user_id}
              action={reviewBuyerAction}
              className="rounded-lg border border-black/10 p-4 dark:border-white/10"
            >
              <input type="hidden" name="userId" value={b.user_id} />

              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-black/60 dark:text-white/60">
                    {b.contact ?? "no contact"} · applied{" "}
                    {formatDateTime(b.created_at)}
                  </div>
                </div>
              </div>

              {b.underwriting_notes ? (
                <p className="mt-2 whitespace-pre-wrap rounded bg-black/[0.03] p-2 text-sm dark:bg-white/[0.04]">
                  {b.underwriting_notes}
                </p>
              ) : (
                <p className="mt-2 text-sm text-black/40 dark:text-white/40">
                  (no application details provided)
                </p>
              )}

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium">
                    Credit limit (PHP)
                  </span>
                  <input
                    type="number"
                    name="credit_limit_pesos"
                    min={0}
                    step="1"
                    defaultValue={defaultLimitPesos}
                    className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">
                    Underwriting notes
                  </span>
                  <input
                    type="text"
                    name="notes"
                    placeholder="Reason / conditions"
                    className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
                  />
                </label>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="submit"
                  name="decision"
                  value="approve"
                  className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
                >
                  Approve
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="reject"
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  Reject
                </button>
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
