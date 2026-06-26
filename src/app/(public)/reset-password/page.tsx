import Link from "next/link";
import { updatePasswordAction } from "@/app/(public)/auth/actions";
import { LogoMark } from "@/components/brand/Logo";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Callout from "@/components/ui/Callout";
import { Field, TextInput } from "@/components/ui/Field";

export const dynamic = "force-dynamic";

/**
 * Set a new password. Reached from the reset email via /auth/confirm, which
 * establishes the short-lived recovery session this page's action relies on.
 * Deliberately does NOT redirect logged-in users away (a recovery session looks
 * "logged in" but exists only to let them set a new password).
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-3 text-center">
        <LogoMark className="mx-auto h-11 w-auto" />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Choose a new password
          </h1>
          <p className="text-sm text-black/55">
            Enter it twice to confirm. At least 8 characters.
          </p>
        </div>
      </div>

      {error ? <Callout tone="error">{error}</Callout> : null}

      <Card className="p-5 sm:p-6">
        <form action={updatePasswordAction} className="space-y-4">
          <Field label="New password">
            <TextInput
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>
          <Field label="Confirm new password">
            <TextInput
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" size="lg" className="w-full">
            Update password
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-black/55">
        Need a new link?{" "}
        <Link
          className="font-semibold text-brand-700 underline-offset-4 hover:underline"
          href="/forgot-password"
        >
          Request another
        </Link>
      </p>
    </div>
  );
}
