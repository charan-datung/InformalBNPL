import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth/staff";
import { signOutAction } from "@/app/(public)/auth/actions";
import { Wordmark } from "@/components/brand/Logo";

/**
 * Operator console layout. Gated to staff (operator OR admin) — anyone else is
 * sent to the login screen. The operator manually runs the whole pilot from
 * here.
 */
export default async function OperatorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const nav = [
    { href: "/operator", label: "Overview" },
    { href: "/operator/members", label: "Members" },
    { href: "/operator/metrics", label: "Metrics" },
    { href: "/operator/loans", label: "Loans" },
    { href: "/operator/releases", label: "Releases" },
    { href: "/operator/payments", label: "Payments" },
    { href: "/operator/reconciliation", label: "Reconcile" },
    { href: "/operator/payouts", label: "Payouts" },
    { href: "/operator/reviews/buyers", label: "Buyer reviews" },
    { href: "/operator/reviews/sellers", label: "Seller reviews" },
    { href: "/operator/referrals", label: "Referrals" },
    { href: "/operator/disputes", label: "Disputes" },
    { href: "/operator/support", label: "Support" },
    { href: "/operator/config", label: "Config" },
    { href: "/operator/audit", label: "Audit" },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-black/10 bg-brand-50 dark:border-white/10 dark:bg-brand-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-2">
              <Wordmark href="/operator" markClassName="h-6 w-auto" />
              <span className="rounded bg-brand-700/10 px-1.5 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-white/10 dark:text-brand-100">
                Operator
              </span>
            </span>
            <nav className="flex flex-wrap gap-3 text-sm">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="text-black/70 underline-offset-4 hover:underline dark:text-white/70"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-black/50 dark:text-white/50">
              {staff.name} · {staff.staff_role}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded border border-black/15 px-2 py-1 font-medium hover:bg-black/[0.04] dark:border-white/15"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
