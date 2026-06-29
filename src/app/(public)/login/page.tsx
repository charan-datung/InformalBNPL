import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/(public)/auth/actions";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { LogoMark } from "@/components/brand/Logo";
import { buttonClasses } from "@/components/ui/Button";
import SubmitButton from "@/app/(public)/onboarding/SubmitButton";
import Card from "@/components/ui/Card";
import Callout from "@/components/ui/Callout";
import { Field, TextInput } from "@/components/ui/Field";
import PasskeySignIn from "@/components/auth/PasskeySignIn";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCapabilities()) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-3 text-center">
        <LogoMark className="mx-auto h-11 w-auto" />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome back
          </h1>
          <p className="text-sm text-black/55">
            Log in to your Datung account.
          </p>
        </div>
      </div>

      {error ? <Callout tone="error">{error}</Callout> : null}

      <Card className="p-5 sm:p-6">
        <form action={signInAction} className="space-y-4">
          <Field label="Email">
            <TextInput
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <TextInput
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </Field>
          <div className="-mt-1 text-right">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <SubmitButton
            pendingText="Logging in…"
            className={buttonClasses({ size: "lg", className: "w-full" })}
          >
            Log in
          </SubmitButton>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-black/35">
          <span className="h-px flex-1 bg-black/10" />
          or
          <span className="h-px flex-1 bg-black/10" />
        </div>

        <PasskeySignIn />
      </Card>

      <p className="text-center text-sm text-black/55">
        New here?{" "}
        <Link
          className="font-semibold text-brand-700 underline-offset-4 hover:underline"
          href="/signup"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
