import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminOrRedirect } from "@/lib/auth/staff";
import { getLoanWithEvents } from "@/lib/operator/queries";
import { adminOverrideAction } from "@/app/(admin)/admin/actions";
import { LOAN_STATUSES } from "@/lib/loans/state-machine";
import { StatusBadge } from "@/lib/loans/status-ui";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminLoanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdminOrRedirect();
  const { id } = await params;
  const { error } = await searchParams;
  const { loan, events, shipmentProofUrl } = await getLoanWithEvents(id);
  if (!loan) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/loans" className="text-sm underline underline-offset-4">
          ← Loans
        </Link>
        <StatusBadge status={loan.status} />
        {loan.hasOverride ? (
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            OVERRIDE
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <Fact k="Buyer" v={loan.buyerName} />
        <Fact k="Seller" v={loan.sellerName} />
        <Fact k="Ticket" v={formatPeso(loan.ticket_centavos)} />
        <Fact k="Tenor" v={`${loan.tenor_months} months`} />
        <Fact
          k="Interest (monthly)"
          v={`${(loan.interest_rate_monthly * 100).toFixed(2)}%`}
        />
        <Fact k="Merchant fee" v={`${loan.merchant_fee_pct}%`} />
        <Fact k="Created" v={formatDateTime(loan.created_at)} />
        <Fact k="Updated" v={formatDateTime(loan.updated_at)} />
      </section>

      {shipmentProofUrl ? (
        <p className="text-sm">
          <a
            href={shipmentProofUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            View shipment proof →
          </a>
        </p>
      ) : null}

      <p className="text-sm">
        For the normal, validated workflow use the{" "}
        <Link
          href={`/operator/loans/${loan.id}`}
          className="underline underline-offset-4"
        >
          operator console
        </Link>
        .
      </p>

      {/* Override — force any state with a mandatory reason */}
      <section className="space-y-2 rounded-lg border border-red-300 p-4 dark:border-red-900">
        <h2 className="font-semibold text-red-700 dark:text-red-400">
          Admin override
        </h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          Force this loan into any status, bypassing the state machine. A reason
          is mandatory and is recorded as a flagged, immutable{" "}
          <code>admin_override</code> event. Use only when the normal workflow
          can&apos;t reach the right state.
        </p>
        <form
          action={adminOverrideAction}
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="loanId" value={loan.id} />
          <label className="space-y-1">
            <span className="block text-xs font-medium">Force status to</span>
            <select
              name="to"
              defaultValue=""
              required
              className="rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            >
              <option value="" disabled>
                choose…
              </option>
              {LOAN_STATUSES.filter((s) => s !== loan.status).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 space-y-1">
            <span className="block text-xs font-medium">Reason (required)</span>
            <input
              type="text"
              name="reason"
              required
              placeholder="Why is this override necessary?"
              className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Force override
          </button>
        </form>
      </section>

      {/* Audit trail with override flagging */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Audit trail ({events.length}) — append-only
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Event</th>
                <th className="py-2 pr-3 text-right font-medium">Amount</th>
                <th className="py-2 pr-3 font-medium">Actor</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const override = e.event_type === "admin_override";
                return (
                  <tr
                    key={e.id}
                    className={`border-b border-black/5 align-top dark:border-white/5 ${
                      override ? "bg-red-50 dark:bg-red-950/40" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap py-2 pr-3 text-black/60 dark:text-white/60">
                      {formatDateTime(e.created_at)}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {override ? (
                        <span className="rounded bg-red-600 px-1 py-0.5 font-bold text-white">
                          {e.event_type}
                        </span>
                      ) : (
                        e.event_type
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatPeso(e.amount_centavos)}
                    </td>
                    <td className="py-2 pr-3">{e.actorName ?? "system"}</td>
                    <td className="py-2 text-black/70 dark:text-white/70">
                      {e.note ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-black/50 dark:text-white/50">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
