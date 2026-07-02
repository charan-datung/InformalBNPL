import Link from "next/link";
import type { Metadata } from "next";
import {
  Store,
  Wallet,
  ShieldCheck,
  Users,
  QrCode,
  BadgeCheck,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Sell on Datung — offer installments, get paid upfront",
  description:
    "Let your customers pay hulugan while you get your money upfront. No permits needed — verify with your ID, your stall or page, and what you sell.",
};

/**
 * Dedicated merchant portal — the seller-facing front door, separate from the
 * generic sign-up. This is the page a BD agent's leave-behind QR points to and
 * the link sellers share with fellow merchants: it pitches the seller value
 * proposition and funnels straight into the seller-intent sign-up rail
 * (/signup?intent=seller → seller verification), skipping the role picker.
 *
 * ?sref=<sellerUserId> (a referring seller's link) is forwarded through sign-up
 * so the referral bounty still attributes.
 */

const BENEFITS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Wallet,
    title: "You get paid upfront",
    body: "The buyer pays Datung in installments — you don't wait and you don't chase payments. Your payout is released as soon as the buyer has their item.",
  },
  {
    icon: Users,
    title: "Sell to more customers",
    body: "Customers who can't pay cash today can still buy from you now and pay over 1–6 months. Bigger baskets, more repeat buyers.",
  },
  {
    icon: ShieldCheck,
    title: "Zero collection risk",
    body: "Datung takes the repayment risk, not you. If a buyer pays late, that's our problem — your money is already yours.",
  },
  {
    icon: QrCode,
    title: "Your own QR + link",
    body: "Get a personal QR code and share link. Customers scan, sign up, and buy from you — every sign-up is tied to your shop.",
  },
];

const STEPS: { title: string; body: string }[] = [
  {
    title: "Create your account",
    body: "Email and password — 2 minutes on your phone.",
  },
  {
    title: "Verify your shop",
    body: "Your government ID, a photo of your stall or page, what you sell, and where. No business permits, no paperwork.",
  },
  {
    title: "Get approved and start selling",
    body: "We review and email you. Then share your QR — customers buy now, pay hulugan, and you get paid upfront.",
  },
];

export default async function MerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ sref?: string }>;
}) {
  const { sref } = await searchParams;
  const signupHref = `/signup?intent=seller${sref ? `&sref=${encodeURIComponent(sref)}` : ""}`;

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="space-y-4 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800">
          <Store className="size-3.5" /> For sellers & merchants
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Your customers pay hulugan.
          <br />
          You get paid upfront.
        </h1>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-black/55">
          Datung lets your customers buy now and pay over time — while you
          receive your money as soon as they get their item. Free to join, no
          business permits needed.
        </p>
        <div className="flex flex-col items-center gap-2">
          <Link
            href={signupHref}
            className={buttonClasses({ size: "lg", className: "w-full max-w-xs" })}
          >
            Register your shop <ArrowRight className="size-4" />
          </Link>
          <p className="text-xs text-black/45">
            Already selling on Datung?{" "}
            <Link
              href="/login"
              className="font-medium text-brand-700 underline underline-offset-4"
            >
              Log in
            </Link>
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="grid gap-3 sm:grid-cols-2">
        {BENEFITS.map((b) => {
          const Icon = b.icon;
          return (
            <Card key={b.title} className="space-y-2 p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="size-5" />
              </span>
              <h2 className="font-semibold text-brand-800">{b.title}</h2>
              <p className="text-sm leading-relaxed text-black/60">{b.body}</p>
            </Card>
          );
        })}
      </section>

      {/* How it works */}
      <section className="space-y-4">
        <h2 className="text-center text-lg font-semibold tracking-tight">
          How to join — 3 steps
        </h2>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{s.title}</p>
                <p className="text-sm leading-relaxed text-black/60">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Trust + CTA */}
      <section className="space-y-4 rounded-2xl border border-brand-100 bg-brand-50/40 p-6 text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-medium text-brand-700">
          <BadgeCheck className="size-4" /> Operated by Dark Knight Lending,
          Inc. — an SEC-registered lending company (CA No. 3506).
        </div>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-black/60">
          Sari-sari and palengke stalls, FB and TikTok live sellers, Shopee
          shops, gadget and RTW resellers — if you sell, you can join. Your
          buyer&apos;s payment is held safely and released to you on delivery.
        </p>
        <Link
          href={signupHref}
          className={buttonClasses({ size: "lg", className: "w-full max-w-xs" })}
        >
          Start selling with Datung
        </Link>
      </section>
    </div>
  );
}
