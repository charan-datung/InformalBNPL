import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Gauge, ShieldCheck, MapPin } from "lucide-react";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { LogoMark } from "@/components/brand/Logo";
import { buttonClasses } from "@/components/ui/Button";
import Card from "@/components/ui/Card";

// Session-dependent: must run per request, never statically cached.
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Fallback for email confirmation: if Supabase's Site URL points at the app
  // root, the verification link lands here as `/?code=...`. Hand it to the auth
  // callback so the code is exchanged for a session and sign-up proceeds.
  const { code } = await searchParams;
  if (code) {
    redirect(`/auth/confirm?code=${encodeURIComponent(code)}&next=/onboarding`);
  }

  // Logged-in users go straight into the app; the dashboard sorts out which
  // stage they're at (role selection, under review, or active). Staff go to
  // their console instead.
  const caps = await getCapabilities();
  if (caps?.staffRole) redirect("/operator");
  if (caps) redirect("/dashboard");

  const features = [
    {
      icon: Gauge,
      title: "Alternative-data underwriting",
      body: "We look at what and where you sell, your sourcing and cash flow — not just paperwork.",
    },
    {
      icon: ShieldCheck,
      title: "Escrow-backed",
      body: "Funds are tracked through booking, escrow, shipping and release so buyers and sellers are protected.",
    },
    {
      icon: MapPin,
      title: "Built for the Philippines",
      body: "Pesos, GCash/Maya and bank payouts, mobile-first — designed for how informal trade really works.",
    },
  ];

  return (
    <div className="space-y-12">
      <section className="flex flex-col items-center pt-6 text-center sm:pt-10">
        <LogoMark className="mb-6 h-16 w-auto" />
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Buy now, pay later — for informal merchants
        </h1>
        <p className="mt-4 max-w-prose text-base text-black/60">
          Datung gives Filipino micro-merchants credit to stock up and sell,
          underwritten on how you actually trade — no business papers required.
          One account lets you buy, sell, or both, each reviewed by a real
          person.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className={buttonClasses({ size: "lg", className: "px-7" })}
          >
            Create an account
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/login"
            className={buttonClasses({
              variant: "secondary",
              size: "lg",
              className: "px-7",
            })}
          >
            Log in
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="p-5 sm:p-6">
            <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Icon className="size-5" />
            </span>
            <h2 className="mt-4 text-sm font-semibold text-foreground">
              {title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-black/55">
              {body}
            </p>
          </Card>
        ))}
      </section>

      <p className="text-center text-xs text-black/40">
        This pilot records loan and escrow state only — it never moves money.
      </p>
    </div>
  );
}
