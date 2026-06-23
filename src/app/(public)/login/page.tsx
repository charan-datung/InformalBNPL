import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/(public)/auth/actions";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { LogoMark } from "@/components/brand/Logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCapabilities()) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-3">
        <LogoMark className="h-10 w-auto" />
        <h1 className="text-2xl font-semibold">Log in to Datung</h1>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <form action={signInAction} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
        >
          Log in
        </button>
      </form>

      <p className="text-sm text-black/60 dark:text-white/60">
        New here?{" "}
        <Link className="underline underline-offset-4" href="/signup">
          Create an account
        </Link>
      </p>
    </div>
  );
}
