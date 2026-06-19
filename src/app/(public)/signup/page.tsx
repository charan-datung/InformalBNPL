import Link from "next/link";
import { redirect } from "next/navigation";
import { signUpAction } from "@/app/(public)/auth/actions";
import { getCapabilities } from "@/lib/profiles/capabilities";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; check_email?: string }>;
}) {
  // Already logged in? Skip straight into the app.
  if (await getCapabilities()) redirect("/dashboard");

  const { error, check_email } = await searchParams;

  if (check_email) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          We sent you a confirmation link. Open it to finish creating your
          account, then you&apos;ll choose what you want to do.
        </p>
        <Link className="text-sm underline underline-offset-4" href="/login">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Just your sign-in details for now — you&apos;ll pick what you want to
          do next.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <form action={signUpAction} className="space-y-4">
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
          <span className="text-sm font-medium">
            Phone <span className="text-black/40 dark:text-white/40">(optional)</span>
          </span>
          <input
            type="tel"
            name="phone"
            autoComplete="tel"
            placeholder="+63 9XX XXX XXXX"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
        >
          Create account
        </button>
      </form>

      <p className="text-sm text-black/60 dark:text-white/60">
        Already have an account?{" "}
        <Link className="underline underline-offset-4" href="/login">
          Log in
        </Link>
      </p>
    </div>
  );
}
