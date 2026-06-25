import Link from "next/link";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { signOutAction } from "@/app/(public)/auth/actions";
import { Wordmark } from "@/components/brand/Logo";
import Button, { buttonClasses } from "@/components/ui/Button";

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
      <header className="sticky top-0 z-10 border-b border-black/[0.07] bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Wordmark href="/" markClassName="h-7 w-auto" />

          {caps ? (
            <div className="flex items-center gap-3 text-sm">
              <Link
                href="/dashboard"
                className="font-medium text-black/60 underline-offset-4 hover:text-foreground hover:underline"
              >
                {caps.email ?? "Dashboard"}
              </Link>
              <form action={signOutAction}>
                <Button type="submit" variant="secondary" size="sm">
                  Log out
                </Button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <Link
                href="/login"
                className="font-medium text-brand-800 underline-offset-4 hover:underline"
              >
                Log in
              </Link>
              <Link href="/signup" className={buttonClasses({ size: "sm" })}>
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
