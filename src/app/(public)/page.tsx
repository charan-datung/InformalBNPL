import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Informal BNPL — Pilot</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Buy-now-pay-later for the Philippines. This is a learning pilot. The
          app records loan and escrow <strong>state</strong> only — it never
          moves money. A human operator executes real transfers outside the app.
        </p>
      </div>

      <div className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
        <p className="font-medium">Scaffold only</p>
        <p className="mt-1 text-black/60 dark:text-white/60">
          No features are built yet. This is the public surface where buyers and
          sellers will sign in under a single account.
        </p>
      </div>

      <nav className="flex flex-wrap gap-3 text-sm">
        <Link className="underline underline-offset-4" href="/operator">
          Operator console →
        </Link>
        <Link className="underline underline-offset-4" href="/admin">
          Admin portal →
        </Link>
        <Link className="underline underline-offset-4" href="/health">
          Health check →
        </Link>
      </nav>
    </div>
  );
}
