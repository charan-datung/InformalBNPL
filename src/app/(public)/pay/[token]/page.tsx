import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { getChargeByToken, isExpired } from "@/lib/payments/charges";
import { getBuyerCredit } from "@/lib/loans/credit";
import { getConfig } from "@/lib/config/system-config";
import { formatPeso } from "@/lib/format";
import { LogoMark } from "@/components/brand/Logo";
import Card from "@/components/ui/Card";
import Callout from "@/components/ui/Callout";
import { buttonClasses } from "@/components/ui/Button";
import PayConfirm from "@/app/(public)/pay/[token]/PayConfirm";

export const dynamic = "force-dynamic";

const MAX_TENOR = 12;

/** Buyer-facing checkout opened from a QR or exclusive link. */
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; error?: string }>;
}) {
  const { token } = await params;
  const { paid, error } = await searchParams;
  const charge = await getChargeByToken(token);

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto max-w-md space-y-5">
      <div className="flex items-center gap-2">
        <LogoMark className="h-7 w-auto" />
        <span className="text-lg font-semibold tracking-tight text-brand-700">
          Datung Pay
        </span>
      </div>
      {children}
    </div>
  );

  if (!charge) {
    return shell(
      <Card className="p-6 text-center">
        <p className="text-sm text-black/55">
          This payment request was not found. Ask the seller for a fresh QR or
          link.
        </p>
      </Card>,
    );
  }

  const expired = await isExpired(charge);
  const status = expired && charge.status === "pending" ? "expired" : charge.status;

  const amountCard = (
    <Card className="p-6 text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-black/45">
        Pay {charge.sellerName}
      </div>
      <div className="mt-1 text-4xl font-bold tabular-nums text-brand-800">
        {formatPeso(charge.amount_centavos)}
      </div>
      {charge.memo ? (
        <div className="mt-1.5 text-sm text-black/55">{charge.memo}</div>
      ) : null}
    </Card>
  );

  // Success (this buyer just paid).
  if (status === "authorized" && paid) {
    return shell(
      <>
        {amountCard}
        <Card className="space-y-2 p-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-accent-500" />
          <div className="text-xl font-semibold text-accent-800">Authorized</div>
          <p className="text-sm text-black/55">
            Your plan is set. Track repayments on your dashboard.
          </p>
          <Link
            href="/dashboard"
            className={buttonClasses({ variant: "primary", size: "md", className: "mt-2 w-full" })}
          >
            Go to dashboard
          </Link>
        </Card>
      </>,
    );
  }

  if (status === "authorized") {
    return shell(
      <>
        {amountCard}
        <Card className="p-6 text-center">
          <p className="text-sm text-black/55">
            This request has already been paid.
          </p>
        </Card>
      </>,
    );
  }

  if (status !== "pending") {
    return shell(
      <>
        {amountCard}
        <Card className="p-6 text-center">
          <p className="text-sm text-black/55">
            This request {charge.status === "cancelled" ? "was cancelled" : "has expired"}.
            Ask the seller for a fresh one.
          </p>
        </Card>
      </>,
    );
  }

  // Pending — gate on buyer eligibility (apply-fallback for everyone else).
  const caps = await getCapabilities();

  const errorBox = error ? <Callout tone="error">{error}</Callout> : null;

  if (!caps) {
    return shell(
      <>
        {amountCard}
        {errorBox}
        <Card className="space-y-3 p-5 sm:p-6">
          <p className="text-sm text-black/70">Log in to pay with Datung.</p>
          <div className="flex gap-2">
            <Link
              href={`/login?next=${encodeURIComponent(`/pay/${token}`)}`}
              className={buttonClasses({ variant: "primary", size: "md", className: "flex-1" })}
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className={buttonClasses({ variant: "secondary", size: "md", className: "flex-1" })}
            >
              Create account
            </Link>
          </div>
        </Card>
      </>,
    );
  }

  if (caps.buyer !== "verified") {
    const applying = caps.buyer === "pending";
    return shell(
      <>
        {amountCard}
        {errorBox}
        <Callout
          tone={applying ? "info" : "warning"}
          title={applying ? "Application under review" : "Credit line needed"}
        >
          <div className="space-y-3">
            <p>
              {applying
                ? "Your buyer application is still under review. Once approved, you can pay instantly."
                : "You need an approved Datung credit line to pay. It takes a quick application."}
            </p>
            {!applying ? (
              <Link
                href="/onboarding/buyer"
                className={buttonClasses({ variant: "primary", size: "sm" })}
              >
                Apply for a credit line
              </Link>
            ) : null}
          </div>
        </Callout>
      </>,
    );
  }

  const [credit, config] = await Promise.all([getBuyerCredit(caps.userId), getConfig()]);

  return shell(
    <>
      {amountCard}
      {errorBox}
      <p className="text-center text-xs text-black/50">
        Available credit:{" "}
        <span className="font-semibold text-black/70">
          {formatPeso(credit.availableCentavos)}
        </span>{" "}
        of {formatPeso(credit.limitCentavos)}
      </p>
      <Card className="p-5 sm:p-6">
        <PayConfirm
          token={token}
          amountCentavos={charge.amount_centavos}
          monthlyRate={config.default_interest_rate_monthly}
          defaultTenor={config.default_tenor_months}
          maxTenor={MAX_TENOR}
          availableCentavos={credit.availableCentavos}
        />
      </Card>
      <div className="flex items-center justify-center gap-1.5 text-xs text-black/45">
        <ShieldCheck className="size-4 text-brand-600" />
        Records your plan only — no money moves in this pilot.
      </div>
    </>,
  );
}
