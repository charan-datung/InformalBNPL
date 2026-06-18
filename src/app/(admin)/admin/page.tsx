import Link from "next/link";

export default function AdminHomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin Portal</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Highest-privilege internal surface: system parameters, staff management,
        audit logs, metrics, and overrides. Scaffold only — nothing is built yet.
      </p>
      <Link className="text-sm underline underline-offset-4" href="/">
        ← Back to public app
      </Link>
    </div>
  );
}
