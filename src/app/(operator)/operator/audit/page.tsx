import { listAuditLog } from "@/lib/audit/log";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Unified audit log: staff actions on profiles, config, and disputes. Loan
 * lifecycle events live on each loan's audit trail (escrow_events).
 */
export default async function AuditPage() {
  const rows = await listAuditLog(200);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit log ({rows.length})</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No audit entries yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Actor</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium">Entity</th>
                <th className="py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-black/5 align-top dark:border-white/5"
                >
                  <td className="whitespace-nowrap py-2 pr-3 text-black/60 dark:text-white/60">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="py-2 pr-3">{r.actorName ?? "system"}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.action}</td>
                  <td className="py-2 pr-3 text-xs">
                    {r.entity_type}
                    {r.entity_id ? (
                      <span className="text-black/40 dark:text-white/40">
                        {" "}
                        · {r.entity_id.slice(0, 8)}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 font-mono text-xs text-black/70 dark:text-white/70">
                    {r.detail ? JSON.stringify(r.detail) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
