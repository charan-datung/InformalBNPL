import Link from "next/link";
import { listReleaseQueue, type ReleaseItem } from "@/lib/operator/queries";
import { transitionLoanAction } from "@/app/(operator)/operator/actions";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Dispute-window / auto-release queue. Computed on load (no cron): loans whose
 * dispute window has elapsed surface here as ready. The app NEVER auto-pays —
 * the operator clears the window and executes the release manually.
 */
export default async function ReleasesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { toRelease, toClear, waiting } = await listReleaseQueue();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Releases</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          The app records state only — it never pays out. Clear the window and
          release manually.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* Ready to release (buyer confirmed, or window already cleared) */}
      <Section
        title={`Ready to release (${toRelease.length})`}
        empty="Nothing ready to release."
        items={toRelease}
        render={(l) => (
          <Row
            l={l}
            sub={
              l.status === "delivered_confirmed"
                ? "Buyer confirmed receipt"
                : "Window cleared — no dispute"
            }
            action={
              <ActionButton
                loanId={l.id}
                to="escrow_released"
                label={`Release escrow → net ${formatPeso(l.netCentavos)}`}
              />
            }
          />
        )}
      />

      {/* Dispute window passed — clear (no dispute) before releasing */}
      <Section
        title={`Dispute window passed (${toClear.length})`}
        empty="No windows have elapsed."
        items={toClear}
        render={(l) => (
          <Row
            l={l}
            sub={`Window ended ${l.windowEndsAt ? formatDateTime(l.windowEndsAt) : "—"} · no dispute raised`}
            action={
              <ActionButton
                loanId={l.id}
                to="auto_released"
                label="Clear window → ready to release"
              />
            }
          />
        )}
      />

      {/* Still within the dispute window — waiting */}
      <Section
        title={`In dispute window (${waiting.length})`}
        empty="No loans currently in their dispute window."
        items={waiting}
        render={(l) => (
          <Row
            l={l}
            sub={`Buyer may dispute until ${l.windowEndsAt ? formatDateTime(l.windowEndsAt) : "—"} · ${l.daysLeft} day(s) left`}
            action={
              <span className="text-xs text-black/40 dark:text-white/40">
                waiting
              </span>
            }
          />
        )}
      />
    </div>
  );
}

function Section({
  title,
  empty,
  items,
  render,
}: {
  title: string;
  empty: string;
  items: ReleaseItem[];
  render: (l: ReleaseItem) => React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">{empty}</p>
      ) : (
        <div className="space-y-2">{items.map(render)}</div>
      )}
    </section>
  );
}

function Row({
  l,
  sub,
  action,
}: {
  l: ReleaseItem;
  sub: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {formatPeso(l.ticket_centavos)} · {l.buyerName} → {l.sellerName}
        </div>
        <div className="text-xs text-black/50 dark:text-white/50">{sub}</div>
      </div>
      <Link
        href={`/operator/loans/${l.id}`}
        className="text-xs underline underline-offset-4"
      >
        details
      </Link>
      {action}
    </div>
  );
}

function ActionButton({
  loanId,
  to,
  label,
}: {
  loanId: string;
  to: string;
  label: string;
}) {
  return (
    <form action={transitionLoanAction}>
      <input type="hidden" name="loanId" value={loanId} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="redirectTo" value="/operator/releases" />
      <button
        type="submit"
        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
      >
        {label}
      </button>
    </form>
  );
}
