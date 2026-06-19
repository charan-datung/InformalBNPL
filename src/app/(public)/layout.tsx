import Link from "next/link";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { signOutAction } from "@/app/(public)/auth/actions";

/**
 * Layout for the public PWA — buyer and seller surfaces.
 *
 * One user account can hold both buyer and seller capabilities under a single
 * identity, so these live together in one route group rather than being split.
 * The header reflects session state: a logged-in user sees their email and a
 * log-out button; everyone else sees log in / sign up.
 */
export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const caps = await getCapabilities();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold">
            Informal BNPL
          </Link>

          {caps ? (
            <div className="flex items-center gap-3 text-sm">
              <Link
                href="/dashboard"
                className="text-black/60 underline-offset-4 hover:underline dark:text-white/60"
              >
                {caps.email ?? "Dashboard"}
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-md border border-black/15 px-3 py-1 font-medium hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.04]"
                >
                  Log out
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <Link href="/login" className="hover:underline">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-slate-900 px-3 py-1 font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
