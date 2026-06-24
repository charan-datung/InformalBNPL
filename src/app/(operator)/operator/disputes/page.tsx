import Link from "next/link";
import { listOpenDisputes } from "@/lib/operator/queries";
import { resolveDisputeAction } from "@/app/(operator)/operator/actions";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const disputes = await listOpenDisputes();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Open disputes ({disputes.length})</h1>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {disputes.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No open disputes.
        </p>
      ) : (
        <div className="space-y-4">
          {disputes.map((d) => (
            <form
              key={d.id}
              action={resolveDisputeAction}
              className="rounded-lg border border-black/10 p-4 dark:border-white/10"
            >
              <input type="hidden" name="disputeId" value={d.id} />

              <div className="flex flex-col gap-4 sm:flex-row">
                {/* Evidence photo */}
                <div className="shrink-0">
                  {d.evidenceUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.evidenceUrl}
                      alt="Dispute evidence"
                      width={128}
                      height={128}
                      loading="lazy"
                      decoding="async"
                      className="h-32 w-32 rounded-md border border-black/10 object-cover dark:border-white/10"
                    />
                  ) : (
                    <div className="flex h-32 w-32 items-center justify-center rounded-md border border-dashed border-black/20 text-xs text-black/40 dark:border-white/20 dark:text-white/40">
                      no evidence
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={d.loanStatus} />
                    <span className="text-sm font-medium">
                      {formatPeso(d.ticket_centavos)}
                    </span>
                    <Link
                      href={`/operator/loans/${d.loan_id}`}
                      className="text-xs underline underline-offset-4"
                    >
                      view loan
                    </Link>
                  </div>
                  <div className="mt-1 text-xs text-black/60 dark:text-white/60">
                    raised by {d.raiserName} · {formatDateTime(d.created_at)}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap rounded bg-black/[0.03] p-2 text-sm dark:bg-white/[0.04]">
                    {d.reason}
                  </p>

                  <label className="mt-3 block space-y-1">
                    <span className="text-xs font-medium">
                      Resolution note (optional)
                    </span>
                    <input
                      type="text"
                      name="note"
                      className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
                    />
                  </label>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      name="outcome"
                      value="buyer"
                      className="rounded-md border border-orange-300 px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-300 dark:hover:bg-orange-950/40"
                    >
                      Resolve for buyer → refund
                    </button>
                    <button
                      type="submit"
                      name="outcome"
                      value="seller"
                      className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
                    >
                      Resolve for seller → release escrow
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
