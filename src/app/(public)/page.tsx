import Link from "next/link";
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";

// Session-dependent: must run per request, never statically cached.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Logged-in users go straight into the app; the dashboard sorts out which
  // stage they're at (role selection, under review, or active).
  if (await getCapabilities()) redirect("/dashboard");

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold">Buy now, pay later</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          A pilot BNPL platform for the Philippines. Create one account and
          choose to buy, sell, or both — each is reviewed by a real person.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
        >
          Create an account
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-black/15 px-5 py-2.5 text-sm font-medium hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.04]"
        >
          Log in
        </Link>
      </div>

      <p className="text-xs text-black/40 dark:text-white/40">
        This pilot records loan and escrow state only — it never moves money.
      </p>
    </div>
  );
}
