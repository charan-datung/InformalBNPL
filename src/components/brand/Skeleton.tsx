/**
 * Lightweight content skeleton — pulsing placeholder blocks shown via a Suspense
 * fallback while an async server panel streams in. Reads as "content is coming"
 * rather than a spinner, which feels faster for data-heavy panels.
 */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="animate-pulse space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10"
    >
      <div className="h-5 w-1/3 rounded bg-black/10 dark:bg-white/10" />
      <div className="h-24 rounded-lg bg-black/[0.06] dark:bg-white/[0.06]" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-2/3 rounded bg-black/10 dark:bg-white/10" />
          <div className="h-3 w-1/2 rounded bg-black/[0.07] dark:bg-white/[0.07]" />
        </div>
      ))}
    </div>
  );
}
