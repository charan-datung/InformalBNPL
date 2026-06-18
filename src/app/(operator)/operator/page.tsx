import Link from "next/link";

export default function OperatorHomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Operator Console</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Internal surface for daily transaction, escrow, and dispute workflow.
        Scaffold only — no workflow is built yet.
      </p>
      <Link className="text-sm underline underline-offset-4" href="/">
        ← Back to public app
      </Link>
    </div>
  );
}
