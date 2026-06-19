import Link from "next/link";
import { requireAdminOrRedirect } from "@/lib/auth/staff";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  // Data-layer gate (also enforced by the layout) — first await in the page.
  await requireAdminOrRedirect();

  const cards = [
    {
      href: "/admin/config",
      title: "System configuration",
      body: "Edit the values that drive the whole app. Every change is logged.",
    },
    {
      href: "/admin/staff",
      title: "Staff management",
      body: "View all users; promote/demote operator and admin roles.",
    },
    {
      href: "/admin/audit",
      title: "Full audit",
      body: "Searchable, immutable trail of every event and admin action.",
    },
    {
      href: "/admin/loans",
      title: "Loans & overrides",
      body: "Read everything operators see, plus force a state with a reason.",
    },
    {
      href: "/operator/metrics",
      title: "Metrics",
      body: "Pilot measurements: funnel, loss rate, disputes, per-seller, timings. Exportable as CSV.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Admin portal</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Highest privilege. Admins can do everything operators can, plus the
          below.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-black/10 p-4 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]"
          >
            <div className="font-medium">{c.title}</div>
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">
              {c.body}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
