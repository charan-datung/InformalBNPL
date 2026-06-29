import { requireAdminOrRedirect } from "@/lib/auth/staff";
import { listAllUsers } from "@/lib/staff/manage";
import {
  updateStaffRoleAction,
  addStaffMemberAction,
} from "@/app/(admin)/admin/actions";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const me = await requireAdminOrRedirect();
  const { error, ok } = await searchParams;
  const users = await listAllUsers();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Staff & users ({users.length})</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Promote or demote staff roles, or add a new staff login. You can&apos;t
        change your own role. Maker-checker payouts need two different staff
        members, so add a second operator/admin here.
      </p>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {ok ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
          {ok}
        </p>
      ) : null}

      {/* Add a brand-new staff login */}
      <details className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <summary className="cursor-pointer text-sm font-medium">
          + Add a staff member
        </summary>
        <form
          action={addStaffMemberAction}
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          <label className="block space-y-1">
            <span className="text-xs font-medium">Full name</span>
            <input
              name="name"
              required
              placeholder="e.g. Maria Santos"
              className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Email</span>
            <input
              name="email"
              type="email"
              required
              placeholder="checker@datung.io"
              className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Temporary password</span>
            <input
              name="password"
              type="text"
              required
              minLength={8}
              placeholder="at least 8 characters"
              className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Role</span>
            <select
              name="role"
              defaultValue="operator"
              className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
            >
              <option value="operator">operator</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
            >
              Create account
            </button>
            <p className="mt-1.5 text-xs text-black/45 dark:text-white/45">
              The account is ready to use immediately. Share the email +
              temporary password with them; they can change it later via Forgot
              password.
            </p>
          </div>
        </form>
      </details>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-black/50 dark:border-white/10 dark:text-white/50">
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">Contact</th>
              <th className="py-2 pr-3 font-medium">Capabilities</th>
              <th className="py-2 pr-3 font-medium">Joined</th>
              <th className="py-2 pr-3 font-medium">Role</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === me.id;
              return (
                <tr
                  key={u.id}
                  className="border-b border-black/5 dark:border-white/5"
                >
                  <td className="py-2 pr-3 font-medium">
                    {u.name}
                    {isMe ? (
                      <span className="ml-1 text-xs text-black/40 dark:text-white/40">
                        (you)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-black/60 dark:text-white/60">
                    {u.contact ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {[u.isBuyer ? "buyer" : null, u.isSeller ? "seller" : null]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="py-2 pr-3 text-black/60 dark:text-white/60">
                    {formatDateTime(u.created_at)}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        u.staff_role === "admin"
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : u.staff_role === "operator"
                            ? "bg-blue-200 text-blue-900"
                            : "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60"
                      }`}
                    >
                      {u.staff_role ?? "user"}
                    </span>
                  </td>
                  <td className="py-2">
                    {isMe ? (
                      <span className="text-xs text-black/30 dark:text-white/30">
                        —
                      </span>
                    ) : (
                      <form
                        action={updateStaffRoleAction}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.staff_role ?? ""}
                          className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/15 dark:bg-transparent"
                        >
                          <option value="">user</option>
                          <option value="operator">operator</option>
                          <option value="admin">admin</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                        >
                          Set
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
