/**
 * Layout for the Operator console — internal staff who run the daily
 * transaction / escrow / dispute workflow.
 *
 * Access control is not wired up yet. Once staff roles exist, this surface
 * will be gated to operators (and above).
 */
export default function OperatorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-black/10 bg-slate-50 dark:border-white/10 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="font-semibold">Operator Console</span>
          <span className="text-xs text-black/50 dark:text-white/50">
            Internal · Staff
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
