import Link from "next/link";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { getChargeByToken, isExpired } from "@/lib/payments/charges";
import { getBuyerCredit } from "@/lib/loans/credit";
import { getConfig } from "@/lib/config/system-config";
import { formatPeso } from "@/lib/format";
import { LogoMark } from "@/components/brand/Logo";
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
        <span className="text-lg font-semibold tracking-tight text-brand-700 dark:text-brand-200">
          Datung Pay
        </span>
      </div>
      {children}
    </div>
  );

  if (!charge) {
    return shell(
      <p className="rounded-lg border border-black/10 p-6 text-sm text-black/60 dark:border-white/10 dark:text-white/60">
        This payment request was not found. Ask the seller for a fresh QR or link.
      </p>,
    );
  }

  const expired = await isExpired(charge);
  const status = expired && charge.status === "pending" ? "expired" : charge.status;

  const amountCard = (
    <div className="rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-6 text-center dark:border-white/10 dark:from-brand-950 dark:to-brand-900">
      <div className="text-xs uppercase tracking-wide text-black/45 dark:text-white/45">
        Pay {charge.sellerName}
      </div>
      <div className="text-4xl font-bold tabular-nums text-brand-800 dark:text-white">
        {formatPeso(charge.amount_centavos)}
      </div>
      {charge.memo ? (
        <div className="mt-1 text-sm text-black/55 dark:text-white/55">{charge.memo}</div>
      ) : null}
    </div>
  );

  // Success (this buyer just paid).
  if (status === "authorized" && paid) {
    return shell(
      <>
        {amountCard}
        <div className="space-y-2 rounded-2xl border border-accent-200 bg-accent-50 p-6 text-center dark:border-accent-900 dark:bg-accent-900/20">
          <div className="text-5xl">✓</div>
          <div className="text-xl font-semibold text-accent-800 dark:text-accent-200">
            Authorized
          </div>
          <p className="text-sm text-black/60 dark:text-white/70">
            Your plan is set. Track repayments on your dashboard.
          </p>
          <Link href="/dashboard" className="inline-block text-sm font-medium text-brand-700 underline underline-offset-4 dark:text-brand-200">
            Go to dashboard
          </Link>
        </div>
      </>,
    );
  }

  if (status === "authorized") {
    return shell(
      <>
        {amountCard}
        <p className="rounded-lg border border-black/10 p-6 text-center text-sm text-black/60 dark:border-white/10 dark:text-white/60">
          This request has already been paid.
        </p>
      </>,
    );
  }

  if (status !== "pending") {
    return shell(
      <>
        {amountCard}
        <p className="rounded-lg border border-black/10 p-6 text-center text-sm text-black/60 dark:border-white/10 dark:text-white/60">
          This request {charge.status === "cancelled" ? "was cancelled" : "has expired"}.
          Ask the seller for a fresh one.
        </p>
      </>,
    );
  }

  // Pending — gate on buyer eligibility (apply-fallback for everyone else).
  const caps = await getCapabilities();

  const errorBox = error ? (
    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {error}
    </p>
  ) : null;

  if (!caps) {
    return shell(
      <>
        {amountCard}
        {errorBox}
        <div className="space-y-2 rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
          <p className="text-black/70 dark:text-white/70">Log in to pay with Datung.</p>
          <div className="flex gap-2">
            <Link href={`/login?next=${encodeURIComponent(`/pay/${token}`)}`} className="rounded-md bg-brand-700 px-4 py-2 font-medium text-white hover:bg-brand-600">
              Log in
            </Link>
            <Link href="/signup" className="rounded-md border border-brand-200 px-4 py-2 font-medium text-brand-800 hover:bg-brand-50 dark:border-white/15 dark:text-white">
              Create account
            </Link>
          </div>
        </div>
      </>,
    );
  }

  if (caps.buyer !== "verified") {
    const applying = caps.buyer === "pending";
    return shell(
      <>
        {amountCard}
        {errorBox}
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-amber-900 dark:text-amber-200">
            {applying
              ? "Your buyer application is still under review. Once approved, you can pay instantly."
              : "You need an approved Datung credit line to pay. It takes a quick application."}
          </p>
          {!applying ? (
            <Link href="/onboarding/buyer" className="inline-block rounded-md bg-brand-700 px-4 py-2 font-medium text-white hover:bg-brand-600">
              Apply for a credit line
            </Link>
          ) : null}
        </div>
      </>,
    );
  }

  const [credit, config] = await Promise.all([getBuyerCredit(caps.userId), getConfig()]);

  return shell(
    <>
      {amountCard}
      {errorBox}
      <p className="text-center text-xs text-black/50 dark:text-white/50">
        Available credit: <span className="font-medium">{formatPeso(credit.availableCentavos)}</span>{" "}
        of {formatPeso(credit.limitCentavos)}
      </p>
      <PayConfirm
        token={token}
        amountCentavos={charge.amount_centavos}
        monthlyRate={config.default_interest_rate_monthly}
        defaultTenor={config.default_tenor_months}
        maxTenor={MAX_TENOR}
        availableCentavos={credit.availableCentavos}
      />
    </>,
  );
}
