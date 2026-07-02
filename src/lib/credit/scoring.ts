import type { BuyerApplication } from "@/lib/profiles/buyer-application";

/**
 * Internal credit scorecard — deterministic, explainable, and recomputable.
 *
 * There is no consumer credit bureau API in the loop yet (CIC access requires
 * accreditation; see operator docs), so this scores what the platform actually
 * observes: capacity (declared income/sales vs. the line), stability (tenure or
 * employment), verifiability (ID OCR, proof of billing, references, disbursement
 * details, consented location), and duplicate/collusion flags. Every point has a
 * reason string so the operator sees WHY, and the output is a recommendation —
 * approval stays a human decision.
 *
 * Pure functions: config and signals are passed in, nothing is fetched, so the
 * same inputs always give the same score (unit-tested).
 */

export type ScoreBand = "A" | "B" | "C" | "D" | "E";

export type ScoreReason = {
  label: string;
  /** Signed points contributed (already applied to the score). */
  points: number;
};

export type BuyerScore = {
  score: number; // 0–100
  band: ScoreBand;
  reasons: ScoreReason[];
  /** Suggested opening credit line (centavos), clamped to config + capacity. */
  recommendedLimitCentavos: number;
  /** True when the scorecard says decline / needs a closer manual look. */
  reviewCarefully: boolean;
};

export type SellerScore = {
  score: number; // 0–100
  band: ScoreBand;
  reasons: ScoreReason[];
  recommendedReservePct: number;
  recommendedCapCentavos: number;
  reviewCarefully: boolean;
};

export function bandOf(score: number): ScoreBand {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "E";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Round centavos down to the nearest whole ₱100 so limits look intentional. */
function roundLimit(centavos: number): number {
  return Math.max(0, Math.floor(centavos / 10_000) * 10_000);
}

// ---- Buyer -------------------------------------------------------------------

export type BuyerScoreInput = {
  buyerKind: "business" | "personal" | null;
  application: BuyerApplication | null;
  /** Duplicate/collusion flags from fraud-flags (count matters, text shown). */
  fraudFlags: string[];
  /** Whether the applicant shared a consented device location. */
  locationConsent: boolean;
  config: {
    defaultLimitCentavos: number;
    maxLimitCentavos: number;
  };
};

export function scoreBuyer(input: BuyerScoreInput): BuyerScore {
  const app = input.application ?? {};
  const reasons: ScoreReason[] = [];
  let score = 0;
  const add = (label: string, points: number) => {
    if (points === 0) return;
    reasons.push({ label, points });
    score += points;
  };

  // Base: a complete application (the form enforces the required core).
  add("Complete application", 10);

  // ---- Capacity (0–40): can the declared cash flow service the line? --------
  const gross =
    (input.buyerKind === "personal"
      ? (app.monthly_income_centavos ?? 0)
      : (app.monthly_sales_centavos ?? 0)) + (app.other_income_centavos ?? 0);
  const existing = app.existing_loan_monthly_centavos ?? 0;
  // Conservative: at most 35% of gross monthly inflow is assumed available for
  // installments, less what's already committed elsewhere.
  const disposable = Math.max(0, gross * 0.35 - existing);
  // A default-limit line repaid over ~3 months needs roughly limit/3 per month.
  const monthlyNeed = input.config.defaultLimitCentavos / 3;
  const ratio = monthlyNeed > 0 ? disposable / monthlyNeed : 0;
  const capacityPts =
    ratio >= 2 ? 40 : ratio >= 1.5 ? 32 : ratio >= 1 ? 24 : ratio >= 0.5 ? 12 : ratio > 0 ? 6 : 0;
  add(
    input.buyerKind === "personal"
      ? "Income covers installments"
      : "Sales cover installments",
    capacityPts,
  );
  if (existing > 0 && gross > 0 && existing > gross * 0.2) {
    add("Heavy existing loan burden", -8);
  }

  // ---- Stability (0–20) ------------------------------------------------------
  if (input.buyerKind === "personal") {
    const st = (app.employment_status ?? "").toLowerCase();
    const pts = st.includes("employed (")
      ? 16
      : st.includes("business owner") || st.includes("ofw")
        ? 14
        : st.includes("self-employed") || st.includes("freelancer")
          ? 10
          : st.includes("student")
            ? 4
            : 0;
    add("Employment stability", pts);
  } else {
    const months = app.months_selling ?? 0;
    const pts = months >= 24 ? 20 : months >= 12 ? 15 : months >= 6 ? 10 : months >= 3 ? 6 : months > 0 ? 3 : 0;
    add("Selling track record", pts);
  }

  // ---- Verifiability (0–30) --------------------------------------------------
  const ocr = app.ocr_id_check ?? null;
  if (ocr) {
    const hits = (ocr.idNumberFound ? 1 : 0) + (ocr.typeKeywordFound ? 1 : 0);
    add("ID OCR check", hits === 2 ? 10 : hits === 1 ? 5 : -5);
  }
  if (app.proof_of_billing_path) add("Proof of billing on file", 6);
  const refs = (app.references ?? []).filter((r) => r.name && r.contact);
  if (refs.length > 0) add("Character references", Math.min(6, refs.length * 3));
  if (app.ewallet_number || app.bank_account_number) {
    add("Disbursement account on file", 4);
  }
  if (app.email) add("Email on file", 2);
  if (input.locationConsent) add("Shared device location", 2);

  // ---- Red flags ---------------------------------------------------------------
  for (const f of input.fraudFlags) add(`⚠ ${f}`, -15);

  score = clamp(Math.round(score), 0, 100);
  const band = bandOf(score);

  // Recommended line: band scales the standard opening limit; capacity caps it
  // (≈3 months of disposable cash flow); config ceiling always wins.
  const bandMultiplier =
    band === "A" ? 1.5 : band === "B" ? 1 : band === "C" ? 0.6 : band === "D" ? 0.4 : 0;
  const capacityCapCentavos = disposable * 3;
  const recommended = roundLimit(
    Math.min(
      input.config.maxLimitCentavos,
      input.config.defaultLimitCentavos * bandMultiplier,
      capacityCapCentavos > 0 ? capacityCapCentavos : 0,
    ),
  );

  return {
    score,
    band,
    reasons,
    recommendedLimitCentavos: recommended,
    reviewCarefully: band === "E" || input.fraudFlags.length > 0,
  };
}

// ---- Seller -------------------------------------------------------------------

export type SellerScoreInput = {
  sellsWhat: string | null;
  socialHandle: string | null;
  marketplaceUrl: string | null;
  /** Free-text "selling since" (year or phrase); parsed leniently. */
  sellingSince: string | null;
  idType: string | null;
  hasStorefrontPin: boolean;
  locationConsent: boolean;
  fraudFlags: string[];
  config: {
    capNewCentavos: number;
    capTrustedCentavos: number;
    reserveNewPct: number;
    reserveTrustedPct: number;
  };
  /** Current year, injected for deterministic tenure math. */
  nowYear: number;
};

/** Years selling parsed from a free-text "selling since" (e.g. "2021"). */
export function yearsSelling(sellingSince: string | null, nowYear: number): number | null {
  if (!sellingSince) return null;
  const m = sellingSince.match(/(19|20)\d{2}/);
  if (!m) return null;
  const y = Number(m[0]);
  if (y > nowYear) return null;
  return nowYear - y;
}

const STRONG_IDS = new Set(["philsys", "umid", "drivers_license", "passport"]);

export function scoreSeller(input: SellerScoreInput): SellerScore {
  const reasons: ScoreReason[] = [];
  let score = 0;
  const add = (label: string, points: number) => {
    if (points === 0) return;
    reasons.push({ label, points });
    score += points;
  };

  // Base: the verification kit (ID + storefront + live-item photos + address)
  // is required at submit, so every complete application starts here.
  add("Verification photos + address", 30);

  if (input.sellsWhat) add("Goods described", 8);
  if (input.socialHandle) add("Social/online shop presence", 6);
  if (input.marketplaceUrl) add("Marketplace page linked", 6);

  const years = yearsSelling(input.sellingSince, input.nowYear);
  const tenurePts =
    years == null ? 0 : years >= 5 ? 20 : years >= 3 ? 15 : years >= 1 ? 10 : 5;
  add("Selling tenure", tenurePts);

  if (input.hasStorefrontPin) add("Storefront pinned on map", 10);
  if (input.locationConsent) add("Shared device location", 8);

  add(
    "Government ID strength",
    input.idType && STRONG_IDS.has(input.idType) ? 12 : input.idType ? 5 : 0,
  );

  for (const f of input.fraudFlags) add(`⚠ ${f}`, -15);

  score = clamp(Math.round(score), 0, 100);
  const band = bandOf(score);

  // Exposure cap: band scales the "new" tier cap (never straight to the trusted
  // cap — trust is earned through settled orders / graduation).
  const capMultiplier =
    band === "A" ? 1.5 : band === "B" ? 1 : band === "C" ? 0.6 : band === "D" ? 0.3 : 0;
  const recommendedCapCentavos = roundLimit(
    Math.min(input.config.capTrustedCentavos, input.config.capNewCentavos * capMultiplier),
  );
  // Reserve: strong applicants get a slightly softer hold; weak ones a stiffer one.
  const recommendedReservePct = clamp(
    band === "A"
      ? Math.max(input.config.reserveTrustedPct, input.config.reserveNewPct - 2.5)
      : band === "B"
        ? input.config.reserveNewPct
        : input.config.reserveNewPct + 5,
    0,
    100,
  );

  return {
    score,
    band,
    reasons,
    recommendedReservePct,
    recommendedCapCentavos,
    reviewCarefully: band === "E" || input.fraudFlags.length > 0,
  };
}
