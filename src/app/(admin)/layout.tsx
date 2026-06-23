import Link from "next/link";
import { requireAdminOrRedirect } from "@/lib/auth/staff";
import { signOutAction } from "@/app/(public)/auth/actions";
import { Wordmark } from "@/components/brand/Logo";

/**
 * Admin portal layout. ROUTE-LAYER access control: requireAdminOrRedirect runs
 * before anything else and sends non-admins away (operators -> /operator,
 * everyone else -> /login). Because it's the first await, no admin page below
 * this layout renders or fetches data for a non-admin.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdminOrRedirect();

  const nav = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/config", label: "Config" },
    { href: "/admin/staff", label: "Staff" },
    { href: "/admin/audit", label: "Audit" },
    { href: "/admin/loans", label: "Loans" },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-white/10 bg-brand-700 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-2">
              <Wordmark href="/admin" onDark markClassName="h-6 w-auto" />
              <span className="rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-medium text-white">
                Admin
              </span>
            </span>
            <nav className="flex flex-wrap gap-3 text-sm">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="text-white/80 underline-offset-4 hover:underline"
                >
                  {n.label}
                </Link>
              ))}
              <Link
                href="/operator"
                className="text-white/50 underline-offset-4 hover:underline"
              >
                Operator console ↗
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-white/60">{admin.name} · admin</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded border border-white/20 px-2 py-1 font-medium hover:bg-white/10"
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
