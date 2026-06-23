import Link from "next/link";
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { LogoMark } from "@/components/brand/Logo";

// Session-dependent: must run per request, never statically cached.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Logged-in users go straight into the app; the dashboard sorts out which
  // stage they're at (role selection, under review, or active).
  if (await getCapabilities()) redirect("/dashboard");

  return (
    <div className="space-y-10">
      <div className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-8 dark:border-white/10 dark:from-brand-950 dark:to-brand-900">
        <LogoMark className="mb-5 h-14 w-auto" />
        <h1 className="text-3xl font-semibold tracking-tight text-brand-800 dark:text-white">
          Buy now, pay later — for informal merchants
        </h1>
        <p className="mt-3 max-w-prose text-sm text-black/60 dark:text-white/70">
          Datung gives Filipino micro-merchants credit to stock up and sell,
          underwritten on how you actually trade — no business papers required.
          One account lets you buy, sell, or both, each reviewed by a real
          person.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-brand-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-600"
          >
            Create an account
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-brand-200 bg-white/70 px-5 py-2.5 text-sm font-medium text-brand-800 hover:bg-white dark:border-white/15 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.04]"
          >
            Log in
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Alternative-data underwriting", "We look at what and where you sell, your sourcing and cash flow — not just paperwork."],
          ["Escrow-backed", "Funds are tracked through booking, escrow, shipping and release so buyers and sellers are protected."],
          ["Built for the Philippines", "Pesos, GCash/Maya and bank payouts, mobile-first — designed for how informal trade really works."],
        ].map(([title, body]) => (
          <div
            key={title}
            className="rounded-xl border border-black/10 p-4 dark:border-white/10"
          >
            <div className="text-sm font-semibold text-brand-700 dark:text-brand-200">
              {title}
            </div>
            <p className="mt-1 text-xs text-black/55 dark:text-white/55">{body}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-black/40 dark:text-white/40">
        This pilot records loan and escrow state only — it never moves money.
      </p>
    </div>
  );
}
