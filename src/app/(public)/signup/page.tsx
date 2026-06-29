import Link from "next/link";
import { redirect } from "next/navigation";
import { signUpAction } from "@/app/(public)/auth/actions";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { LogoMark } from "@/components/brand/Logo";
import { buttonClasses } from "@/components/ui/Button";
import SubmitButton from "@/app/(public)/onboarding/SubmitButton";
import Card from "@/components/ui/Card";
import Callout from "@/components/ui/Callout";
import { Field, TextInput } from "@/components/ui/Field";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    check_email?: string;
    ref?: string;
    intent?: string;
    sref?: string;
  }>;
}) {
  // Already logged in? Skip straight into the app.
  if (await getCapabilities()) redirect("/dashboard");

  const { error, check_email, ref, intent, sref } = await searchParams;
  // A seller-acquisition link frames sign-up for sellers and (via sref) carries
  // the referring seller through to the bounty.
  const sellerIntent = intent === "seller";

  if (check_email) {
    return (
      <div className="mx-auto max-w-sm space-y-6 text-center">
        <LogoMark className="mx-auto h-11 w-auto" />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Check your email
          </h1>
          <p className="text-sm text-black/55">
            We sent you a confirmation link. Open it to finish creating your
            account, then you&apos;ll choose what you want to do.
          </p>
        </div>
        <p className="text-sm text-black/55">
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

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-3 text-center">
        <LogoMark className="mx-auto h-11 w-auto" />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {sellerIntent ? "Sell on Datung" : "Create your account"}
          </h1>
          <p className="text-sm text-black/55">
            {sellerIntent
              ? "Create your account — next you'll verify your shop and start selling to buyers who pay in installments."
              : "Just your sign-in details for now — you'll pick what you want to do next."}
          </p>
        </div>
      </div>

      {error ? <Callout tone="error">{error}</Callout> : null}

      {sellerIntent ? (
        <Callout tone="info">
          You&apos;re joining Datung as a seller. After sign-up we&apos;ll take
          you straight to seller verification.
        </Callout>
      ) : ref ? (
        <Callout tone="info">
          You were invited by a Datung seller — finish signing up to shop now and
          pay in small amounts.
        </Callout>
      ) : null}

      <Card className="p-5 sm:p-6">
        <form action={signUpAction} className="space-y-4">
          {/* Carries the referring seller through sign-up (from their invite link/QR). */}
          {ref ? <input type="hidden" name="ref" value={ref} /> : null}
          {/* Seller-acquisition link: route into seller onboarding, and carry
              the referring seller for the bounty. */}
          {sellerIntent ? (
            <input type="hidden" name="intent" value="seller" />
          ) : null}
          {sref ? <input type="hidden" name="sref" value={sref} /> : null}
          <Field label="Email">
            <TextInput
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Phone" optional>
            <TextInput
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+63 9XX XXX XXXX"
            />
          </Field>
          <Field label="Password" hint="At least 6 characters.">
            <TextInput
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>
          <SubmitButton
            pendingText="Creating account…"
            className={buttonClasses({ size: "lg", className: "w-full" })}
          >
            Create account
          </SubmitButton>
        </form>
      </Card>

      <p className="text-center text-sm text-black/55">
        Already have an account?{" "}
        <Link
          className="font-semibold text-brand-700 underline-offset-4 hover:underline"
          href="/login"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
