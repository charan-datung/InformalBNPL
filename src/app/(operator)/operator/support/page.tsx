import { listSupportRequests } from "@/lib/support/requests";
import { resolveSupportAction } from "@/app/(operator)/operator/actions";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Operator triage of buyer/seller support requests. */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const requests = await listSupportRequests();
  const open = requests.filter((r) => r.status === "open");
  const resolved = requests.filter((r) => r.status !== "open");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Support requests</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {open.length} open · {resolved.length} resolved
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {requests.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No support requests yet.
        </p>
      ) : (
        <div className="space-y-3">
          {[...open, ...resolved].map((r) => (
            <div
              key={r.id}
              className={`rounded-lg border p-4 ${
                r.status === "open"
                  ? "border-black/10 dark:border-white/10"
                  : "border-black/5 bg-black/[0.02] dark:border-white/5 dark:bg-white/[0.02]"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-black/10 px-1.5 py-0.5 text-[11px] font-medium uppercase dark:bg-white/10">
                      {r.context}
                    </span>
                    <span className="font-medium">
                      {r.userName ?? "Unknown user"}
                    </span>
                    {r.status === "resolved" ? (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                        resolved
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-black/55 dark:text-white/55">
                    Reply to: {r.contact ?? r.userContact ?? "no contact on file"}{" "}
                    · {formatDateTime(r.createdAt)}
                  </div>
                </div>
                {r.status === "open" ? (
                  <form action={resolveSupportAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-black/15 px-3 py-1 text-xs font-medium hover:bg-black/[0.03] dark:border-white/15"
                    >
                      Mark resolved
                    </button>
                  </form>
                ) : null}
              </div>
              {r.subject ? (
                <div className="mt-2 text-sm font-medium">{r.subject}</div>
              ) : null}
              <p className="mt-1 whitespace-pre-wrap text-sm text-black/75 dark:text-white/75">
                {r.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
