import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/profiles/capabilities";
import { getAccountProfile } from "@/lib/profiles/account";
import { getConfig } from "@/lib/config/system-config";
import LoanAgreement from "@/components/legal/LoanAgreement";

export const dynamic = "force-dynamic";

/**
 * The master Credit Agreement for the logged-in user to read before accepting it
 * at onboarding. Clean, print-friendly. Rates come from live config; the credit
 * limit is omitted (set later at underwriting).
 */
export default async function CreditAgreementPage() {
  const caps = await getCapabilities();
  if (!caps) redirect("/login?next=/legal/credit-agreement");

  const [account, config] = await Promise.all([
    getAccountProfile(caps.userId, caps.email),
    getConfig(),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-black/[0.04] py-8">
      <LoanAgreement
        borrower={{ name: account.name || caps.email || "Borrower" }}
        date={today}
        interestRateMonthly={config.default_interest_rate_monthly}
        processingFeePct={config.processing_fee_pct}
        penaltyRateMonthly={config.penalty_rate_monthly}
      />
    </main>
  );
}
