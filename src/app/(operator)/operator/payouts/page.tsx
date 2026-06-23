import { getCurrentStaff } from "@/lib/auth/staff";
import {
  listSellersWithPayable,
  listProposedPayouts,
  listRecentPayouts,
} from "@/lib/payouts/payouts";
import {
  proposePayoutAction,
  decidePayoutAction,
} from "@/app/(operator)/operator/actions";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [staff, sellers, proposed, recent] = await Promise.all([
    getCurrentStaff(),
    listSellersWithPayable(),
    listProposedPayouts(),
    listRecentPayouts(),
  ]);
  const me = staff?.id ?? "";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Seller payouts</h1>
        <p className="text-sm text-black/55 dark:text-white/55">
          Maker-checker: one staffer proposes a payout, a different one approves.
          Approval posts the ledger settlement — money moves over rails later.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* Maker: sellers with available payable */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Available to pay out ({sellers.length})
        </h2>
        {sellers.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            No sellers have a releasable balance right now.
          </p>
        ) : (
          sellers.map((s) => (
            <form
              key={s.sellerUserId}
              action={proposePayoutAction}
              className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10"
            >
              <input type="hidden" name="seller_user_id" value={s.sellerUserId} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-black/55 dark:text-white/55">
                  Available {formatPeso(s.availableCentavos)}
                </div>
              </div>
              <label className="space-y-1">
                <span className="block text-xs font-medium">Amount ₱</span>
                <input
                  type="number"
                  name="amount_pesos"
                  min={1}
                  step="1"
                  defaultValue={Math.round(s.availableCentavos / 100)}
                  className="w-28 rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
                />
              </label>
              <input
                type="text"
                name="note"
                placeholder="Note (optional)"
                className="w-40 rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
              />
              <button
                type="submit"
                className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
              >
                Propose payout
              </button>
            </form>
          ))
        )}
      </section>

      {/* Checker: proposed payouts awaiting a second approval */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Pending approval ({proposed.length})
        </h2>
        {proposed.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            Nothing awaiting approval.
          </p>
        ) : (
          proposed.map((p) => {
            const isOwn = p.maker_user_id === me;
            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {formatPeso(p.amount_centavos)} → {p.sellerName}
                  </div>
                  <div className="text-xs text-black/55 dark:text-white/55">
                    Proposed by {p.makerName} · {formatDateTime(p.created_at)}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                {isOwn ? (
                  // Maker-checker: you can't approve your own proposal. Server
                  // enforces this too; the UI just makes it clear.
                  <span className="text-xs italic text-black/45 dark:text-white/45">
                    Needs another staffer to approve
                  </span>
                ) : (
                  <form action={decidePayoutAction}>
                    <input type="hidden" name="payoutId" value={p.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <button
                      type="submit"
                      className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
                    >
                      Approve
                    </button>
                  </form>
                )}
                <form action={decidePayoutAction}>
                  <input type="hidden" name="payoutId" value={p.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <button
                    type="submit"
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300"
                  >
                    Reject
                  </button>
                </form>
              </div>
            );
          })
        )}
      </section>

      {/* History */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Recent decisions
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No payouts yet.</p>
        ) : (
          <div className="divide-y divide-black/5 rounded-lg border border-black/10 dark:divide-white/5 dark:border-white/10">
            {recent.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span
                  className={
                    p.status === "approved"
                      ? "rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      : "rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300"
                  }
                >
                  {p.status}
                </span>
                <span className="font-medium">{formatPeso(p.amount_centavos)}</span>
                <span className="text-black/55 dark:text-white/55">→ {p.sellerName}</span>
                <span className="text-xs text-black/45 dark:text-white/45">
                  {p.makerName} → {p.checkerName ?? "—"}
                  {p.decided_at ? ` · ${formatDateTime(p.decided_at)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
