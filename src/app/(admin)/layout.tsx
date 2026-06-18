/**
 * Layout for the Admin portal — highest privilege, internal only.
 *
 * Admins configure system parameters, manage staff, see all audit logs and
 * metrics, and can override. Access control is not wired up yet; this surface
 * will be gated to admins once staff roles exist.
 */
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-black/10 bg-slate-900 text-white dark:border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="font-semibold">Admin Portal</span>
          <span className="text-xs text-white/60">Internal · Highest privilege</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
