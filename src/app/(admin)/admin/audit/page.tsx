import { requireAdminOrRedirect } from "@/lib/auth/staff";
import { searchAudit } from "@/lib/audit/search";
import { listAllUsers } from "@/lib/staff/manage";
import { ESCROW_EVENT_TYPES } from "@/lib/loans/events";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const AUDIT_ACTIONS = [
  "buyer_approved",
  "buyer_rejected",
  "seller_approved",
  "seller_rejected",
  "dispute_resolved_buyer",
  "dispute_resolved_seller",
  "config_updated",
  "staff_role_changed",
  "admin_override",
];

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    actor?: string;
    loan?: string;
    type?: string;
    from?: string;
    to?: string;
  }>;
}) {
  await requireAdminOrRedirect();
  const sp = await searchParams;

  const [rows, users] = await Promise.all([
    searchAudit({
      actorUserId: sp.actor || undefined,
      loanId: sp.loan || undefined,
      eventType: sp.type || undefined,
      dateFrom: sp.from || undefined,
      dateTo: sp.to || undefined,
    }),
    listAllUsers(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit trail</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Every loan event and admin action — the complete immutable trail. Filter
        by user, loan, type, and date.
      </p>

      {/* Filters (GET) */}
      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
        <label className="space-y-1">
          <span className="block text-xs font-medium">User</span>
          <select
            name="actor"
            defaultValue={sp.actor ?? ""}
            className="rounded-md border border-black/15 px-2 py-1 dark:border-white/15 dark:bg-transparent"
          >
            <option value="">any</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">Type</span>
          <select
            name="type"
            defaultValue={sp.type ?? ""}
            className="rounded-md border border-black/15 px-2 py-1 dark:border-white/15 dark:bg-transparent"
          >
            <option value="">any</option>
            <optgroup label="Loan events">
              {ESCROW_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </optgroup>
            <optgroup label="Admin actions">
              {AUDIT_ACTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">Loan id</span>
          <input
            type="text"
            name="loan"
            defaultValue={sp.loan ?? ""}
            placeholder="uuid"
            className="w-44 rounded-md border border-black/15 px-2 py-1 dark:border-white/15 dark:bg-transparent"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">From</span>
          <input
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className="rounded-md border border-black/15 px-2 py-1 dark:border-white/15 dark:bg-transparent"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">To</span>
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className="rounded-md border border-black/15 px-2 py-1 dark:border-white/15 dark:bg-transparent"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <th className="py-2 pr-3 font-medium">When</th>
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="py-2 pr-3 font-medium">Type</th>
              <th className="py-2 pr-3 font-medium">Actor</th>
              <th className="py-2 pr-3 font-medium">Loan / entity</th>
              <th className="py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-3 text-black/50 dark:text-white/50">
                  No matching audit entries.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.key}
                  className={`border-b border-black/5 align-top dark:border-white/5 ${
                    r.isOverride ? "bg-red-50 dark:bg-red-950/40" : ""
                  }`}
                >
                  <td className="whitespace-nowrap py-2 pr-3 text-black/60 dark:text-white/60">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="py-2 pr-3 text-xs">{r.source}</td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.isOverride ? (
                      <span className="rounded bg-red-600 px-1 py-0.5 font-bold text-white">
                        {r.type}
                      </span>
                    ) : (
                      r.type
                    )}
                  </td>
                  <td className="py-2 pr-3">{r.actorName ?? "system"}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-black/60 dark:text-white/60">
                    {r.loanId
                      ? r.loanId.slice(0, 8)
                      : (r.entityLabel ?? "—")}
                  </td>
                  <td className="py-2 text-xs text-black/70 dark:text-white/70">
                    {r.note}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
