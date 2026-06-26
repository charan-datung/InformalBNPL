import Link from "next/link";
import { requestPasswordResetAction } from "@/app/(public)/auth/actions";
import { LogoMark } from "@/components/brand/Logo";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Callout from "@/components/ui/Callout";
import { Field, TextInput } from "@/components/ui/Field";

export const dynamic = "force-dynamic";

/**
 * "Forgot password" — collects an email and sends a Supabase reset link. The
 * confirmation is intentionally the same whether or not the email exists.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-3 text-center">
        <LogoMark className="mx-auto h-11 w-auto" />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Reset your password
          </h1>
          <p className="text-sm text-black/55">
            We&apos;ll email you a link to set a new one.
          </p>
        </div>
      </div>

      {error ? <Callout tone="error">{error}</Callout> : null}

      {sent ? (
        <Callout tone="success" title="Check your email">
          If an account exists for that address, a password reset link is on its
          way. The link expires after a while, so use it soon.
        </Callout>
      ) : (
        <Card className="p-5 sm:p-6">
          <form action={requestPasswordResetAction} className="space-y-4">
            <Field label="Email">
              <TextInput
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </Field>
            <Button type="submit" size="lg" className="w-full">
              Send reset link
            </Button>
          </form>
        </Card>
      )}

      <p className="text-center text-sm text-black/55">
        Remembered it?{" "}
        <Link
          className="font-semibold text-brand-700 underline-offset-4 hover:underline"
          href="/login"
        >
          Back to log in
        </Link>
      </p>
    </div>
  );
}
