import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ShoppingBag,
  Store,
  Sparkles,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { createClient } from "@/lib/supabase/server";

// Session-dependent: must run per request, never statically cached.
export const dynamic = "force-dynamic";

/**
 * Stage 2 — role selection. Neutral screen shown right after signup and
 * whenever a logged-in user still has no capability. Choices are NOT exclusive:
 * "Both" walks through buyer then seller, and either can be added later from the
 * dashboard.
 */
export default async function OnboardingPage() {
  const caps = await getCapabilities();
  if (!caps) redirect("/login");
  // Staff belong in the operator console, never buyer/seller onboarding.
  if (caps.staffRole) redirect("/operator");

  // If they already applied for something, the dashboard is the right place.
  if (caps.buyer !== "none" || caps.seller !== "none") redirect("/dashboard");

  // Arrived via a seller-acquisition link: skip the neutral choice and go
  // straight to seller verification. Works regardless of how they got here
  // (instant sign-up or after email confirmation), since the intent rides on
  // the auth user's metadata.
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (user?.user_metadata?.signup_intent === "seller") {
    redirect("/onboarding/seller");
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          What would you like to do?
        </h1>
        <p className="text-sm text-black/55">
          You can change or add to this later — it&apos;s not a one-time choice.
        </p>
      </div>

      <div className="grid gap-3">
        <RoleCard
          href="/onboarding/buyer"
          icon={ShoppingBag}
          title="Buy"
          description="Shop now and pay in small amounts. Starts a quick application."
        />
        <RoleCard
          href="/onboarding/seller"
          icon={Store}
          title="Sell"
          description="Sell to buyers who pay in installments. Starts seller verification."
        />
        <RoleCard
          href="/onboarding/buyer?next=seller"
          icon={Sparkles}
          title="Both"
          description="We'll take you through the buyer application, then seller verification."
        />
      </div>
    </div>
  );
}

function RoleCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 rounded-xl border border-black/10 bg-white p-4 shadow-sm shadow-brand-950/[0.03] transition-colors hover:border-brand-200 hover:bg-brand-50/40"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-black/55">
          {description}
        </p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-black/25 transition-colors group-hover:text-brand-600" />
    </Link>
  );
}
