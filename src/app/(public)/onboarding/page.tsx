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
          Which one are you?
        </h1>
        <p className="text-sm text-black/55">
          Pick what fits you. You can add the other later — it&apos;s not
          permanent.
        </p>
      </div>

      <div className="grid gap-3">
        <RoleCard
          href="/onboarding/seller"
          icon={Store}
          title="I sell things"
          chooseIf="Choose this if you have a shop or products to sell and want your customers to pay in installments (hulugan)."
          example="e.g. you sell on Facebook/Shopee, run a stall, or own a store."
        />
        <RoleCard
          href="/onboarding/buyer"
          icon={ShoppingBag}
          title="I want to shop"
          chooseIf="Choose this if you want to buy things now and pay for them in small amounts over time."
          example="e.g. you're a customer buying from a seller."
        />
        <RoleCard
          href="/onboarding/buyer?next=seller"
          icon={Sparkles}
          title="Both"
          chooseIf="I want to sell my products AND shop from others."
          example="We'll set up selling and buying, one after the other."
        />
      </div>

      <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4 text-sm text-black/60">
        <p>
          <strong className="text-foreground">Not sure?</strong> If you have
          something to <strong>sell</strong>, pick{" "}
          <span className="font-semibold text-brand-700">&ldquo;I sell things&rdquo;</span>
          . If you just want to <strong>buy</strong>, pick{" "}
          <span className="font-semibold text-brand-700">&ldquo;I want to shop&rdquo;</span>
          . You can always add the other one later from your dashboard.
        </p>
      </div>
    </div>
  );
}

function RoleCard({
  href,
  icon: Icon,
  title,
  chooseIf,
  example,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  chooseIf: string;
  example: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3.5 rounded-2xl border border-black/10 bg-white p-4 shadow-sm shadow-brand-950/[0.03] transition-colors hover:border-brand-300 hover:bg-brand-50/40"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
        <Icon className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-black/70">{chooseIf}</p>
        <p className="mt-1 text-xs italic text-black/45">{example}</p>
      </div>
      <ChevronRight className="mt-1 size-5 shrink-0 text-black/25 transition-colors group-hover:text-brand-600" />
    </Link>
  );
}
