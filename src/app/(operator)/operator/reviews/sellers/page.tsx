import { listPendingSellers } from "@/lib/operator/queries";
import { reviewSellerAction } from "@/app/(operator)/operator/actions";
import { getConfig } from "@/lib/config/system-config";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SellerReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [sellers, config] = await Promise.all([
    listPendingSellers(),
    getConfig(),
  ]);

  // Default rolling reserve prefilled from system_config.
  const defaultReservePct = config.default_reserve_pct;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        Pending seller verifications ({sellers.length})
      </h1>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {sellers.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No pending seller verifications.
        </p>
      ) : (
        <div className="space-y-4">
          {sellers.map((s) => (
            <form
              key={s.user_id}
              action={reviewSellerAction}
              className="rounded-lg border border-black/10 p-4 dark:border-white/10"
            >
              <input type="hidden" name="userId" value={s.user_id} />

              <div className="flex flex-col gap-4 sm:flex-row">
                {/* Live item photo */}
                <div className="shrink-0">
                  {s.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.photoUrl}
                      alt="Live item"
                      className="h-32 w-32 rounded-md border border-black/10 object-cover dark:border-white/10"
                    />
                  ) : (
                    <div className="flex h-32 w-32 items-center justify-center rounded-md border border-dashed border-black/20 text-xs text-black/40 dark:border-white/20 dark:text-white/40">
                      no photo
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-black/60 dark:text-white/60">
                    {s.contact ?? "no contact"} · {s.social_handle ?? "no handle"}{" "}
                    · applied {formatDateTime(s.created_at)}
                  </div>
                  {s.verification_notes ? (
                    <p className="mt-2 whitespace-pre-wrap rounded bg-black/[0.03] p-2 text-sm dark:bg-white/[0.04]">
                      {s.verification_notes}
                    </p>
                  ) : null}

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium">Trust tier</span>
                      <select
                        name="trust_tier"
                        defaultValue="new"
                        className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
                      >
                        <option value="new">new</option>
                        <option value="trusted">trusted</option>
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium">Reserve %</span>
                      <input
                        type="number"
                        name="reserve_pct"
                        min={0}
                        max={100}
                        step="0.5"
                        defaultValue={defaultReservePct}
                        className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium">Notes</span>
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
                </div>
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
