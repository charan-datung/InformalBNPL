import { CONFIG_DEFAULTS } from "@/lib/config/system-config";
import { computeLoanTerms } from "@/lib/loans/finance";
import type { LoanDocData } from "@/lib/legal/types";
import DisclosureStatement from "@/components/legal/DisclosureStatement";
import PromissoryNote from "@/components/legal/PromissoryNote";
import LoanAgreement from "@/components/legal/LoanAgreement";

export const dynamic = "force-dynamic";

/**
 * Internal PREVIEW of the borrower legal documents with sample data, so the team
 * can review wording, figures, and print layout before they're wired into the
 * live onboarding/checkout flow. Not part of any borrower journey. Figures use
 * the code-default config values.
 */
export default function LegalPreviewPage() {
  const rate = CONFIG_DEFAULTS.default_interest_rate_monthly;
  const processingFeePct = CONFIG_DEFAULTS.processing_fee_pct;
  const penaltyRateMonthly = CONFIG_DEFAULTS.penalty_rate_monthly;
  const date = "2026-06-26";

  const terms = computeLoanTerms({
    principalCentavos: 300_000, // ₱3,000 sample purchase
    tenorMonths: 3,
    interestRateMonthly: rate,
    frequency: "monthly",
    processingFeePct,
    penaltyRateMonthly,
    startDate: new Date(`${date}T00:00:00Z`),
  });

  const sample: LoanDocData = {
    loanRef: "DATUNG-PREVIEW-0001",
    date,
    borrower: {
      name: "Juan Dela Cruz",
      address: "123 Mabini St., Brgy. Poblacion, Quezon City",
      contact: "0917 123 4567",
    },
    terms,
    purchaseDescription: "Purchase from Aling Nena's Sari-Sari Store",
  };

  return (
    <main className="min-h-screen bg-black/[0.04] py-8">
      <p className="mx-auto mb-6 max-w-3xl px-6 text-xs text-black/55 print:hidden">
        Document preview (sample data, default config figures). Review wording and
        layout; the live flow will populate real loan and borrower details and
        record the borrower’s acceptance.
      </p>

      <div className="space-y-8">
        <div className="print:break-after-page">
          <DisclosureStatement data={sample} />
        </div>
        <div className="print:break-after-page">
          <PromissoryNote data={sample} />
        </div>
        <div>
          <LoanAgreement
            borrower={sample.borrower}
            date={date}
            creditLimitCentavos={CONFIG_DEFAULTS.default_credit_limit_centavos}
            interestRateMonthly={rate}
            processingFeePct={processingFeePct}
            penaltyRateMonthly={penaltyRateMonthly}
          />
        </div>
      </div>
    </main>
  );
}
