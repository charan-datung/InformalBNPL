import { describe, it, expect } from "vitest";
import {
  scoreBuyer,
  scoreSeller,
  bandOf,
  yearsSelling,
  type BuyerScoreInput,
  type SellerScoreInput,
} from "@/lib/credit/scoring";

const BUYER_CONFIG = {
  defaultLimitCentavos: 500_000, // ₱5,000
  maxLimitCentavos: 500_000,
};

const SELLER_CONFIG = {
  capNewCentavos: 500_000,
  capTrustedCentavos: 5_000_000,
  reserveNewPct: 10,
  reserveTrustedPct: 5,
};

function buyerInput(over: Partial<BuyerScoreInput> = {}): BuyerScoreInput {
  return {
    buyerKind: "business",
    application: null,
    fraudFlags: [],
    locationConsent: false,
    config: BUYER_CONFIG,
    ...over,
  };
}

function sellerInput(over: Partial<SellerScoreInput> = {}): SellerScoreInput {
  return {
    sellsWhat: null,
    socialHandle: null,
    marketplaceUrl: null,
    sellingSince: null,
    idType: null,
    hasStorefrontPin: false,
    locationConsent: false,
    fraudFlags: [],
    config: SELLER_CONFIG,
    nowYear: 2026,
    ...over,
  };
}

describe("bandOf", () => {
  it("maps score ranges to bands", () => {
    expect(bandOf(85)).toBe("A");
    expect(bandOf(80)).toBe("A");
    expect(bandOf(79)).toBe("B");
    expect(bandOf(65)).toBe("B");
    expect(bandOf(50)).toBe("C");
    expect(bandOf(35)).toBe("D");
    expect(bandOf(34)).toBe("E");
    expect(bandOf(0)).toBe("E");
  });
});

describe("scoreBuyer", () => {
  it("is deterministic: same input, same output", () => {
    const input = buyerInput({
      application: { monthly_sales_centavos: 2_000_000, months_selling: 18 },
    });
    expect(scoreBuyer(input)).toEqual(scoreBuyer(input));
  });

  it("scores a strong business applicant into a high band with a full limit", () => {
    const s = scoreBuyer(
      buyerInput({
        application: {
          monthly_sales_centavos: 3_000_000, // ₱30k/mo sales
          months_selling: 36,
          proof_of_billing_path: "x/proof.jpg",
          references: [
            { name: "Ana", contact: "0917" },
            { name: "Ben", contact: "0918" },
          ],
          ewallet_number: "0917",
          email: "x@y.ph",
          ocr_id_check: {
            idNumberFound: true,
            typeKeywordFound: true,
            textPreview: "",
            ranAt: "",
          },
        },
        locationConsent: true,
      }),
    );
    expect(s.band).toBe("A");
    expect(s.recommendedLimitCentavos).toBe(BUYER_CONFIG.maxLimitCentavos);
    expect(s.reviewCarefully).toBe(false);
  });

  it("caps the recommended limit by declared capacity, not just band", () => {
    // ₱2,000/mo sales → disposable = 700 → cap = ₱2,100, far below default.
    const s = scoreBuyer(
      buyerInput({
        application: { monthly_sales_centavos: 200_000, months_selling: 36 },
      }),
    );
    expect(s.recommendedLimitCentavos).toBeLessThanOrEqual(200_000 * 0.35 * 3);
    // Rounded down to a whole ₱100.
    expect(s.recommendedLimitCentavos % 10_000).toBe(0);
  });

  it("gives zero capacity points and ₱0 recommendation with no declared income", () => {
    const s = scoreBuyer(buyerInput({ application: {} }));
    expect(s.recommendedLimitCentavos).toBe(0);
    expect(s.band === "E" || s.band === "D").toBe(true);
  });

  it("deducts existing loan burden above 20% of gross", () => {
    const base = buyerInput({
      application: { monthly_sales_centavos: 1_000_000, months_selling: 12 },
    });
    const burdened = buyerInput({
      application: {
        monthly_sales_centavos: 1_000_000,
        months_selling: 12,
        existing_loan_monthly_centavos: 300_000,
      },
    });
    expect(scoreBuyer(burdened).score).toBeLessThan(scoreBuyer(base).score);
  });

  it("flags fraud signals: score drops and reviewCarefully is set", () => {
    const clean = scoreBuyer(
      buyerInput({
        application: { monthly_sales_centavos: 2_000_000, months_selling: 24 },
      }),
    );
    const flagged = scoreBuyer(
      buyerInput({
        application: { monthly_sales_centavos: 2_000_000, months_selling: 24 },
        fraudFlags: ["Duplicate ID number on 1 other application(s)"],
      }),
    );
    expect(flagged.score).toBe(clean.score - 15);
    expect(flagged.reviewCarefully).toBe(true);
    expect(flagged.reasons.some((r) => r.label.startsWith("⚠"))).toBe(true);
  });

  it("scores personal applicants on employment instead of tenure", () => {
    const employed = scoreBuyer(
      buyerInput({
        buyerKind: "personal",
        application: {
          monthly_income_centavos: 2_500_000,
          employment_status: "Employed (private)",
        },
      }),
    );
    const unemployed = scoreBuyer(
      buyerInput({
        buyerKind: "personal",
        application: {
          monthly_income_centavos: 2_500_000,
          employment_status: "Unemployed",
        },
      }),
    );
    expect(employed.score).toBeGreaterThan(unemployed.score);
  });

  it("failed OCR check subtracts points", () => {
    const noOcr = scoreBuyer(
      buyerInput({ application: { monthly_sales_centavos: 1_000_000 } }),
    );
    const failed = scoreBuyer(
      buyerInput({
        application: {
          monthly_sales_centavos: 1_000_000,
          ocr_id_check: {
            idNumberFound: false,
            typeKeywordFound: false,
            textPreview: "",
            ranAt: "",
          },
        },
      }),
    );
    expect(failed.score).toBe(noOcr.score - 5);
  });

  it("never exceeds the config max limit even for a perfect A", () => {
    const s = scoreBuyer(
      buyerInput({
        application: {
          monthly_sales_centavos: 100_000_000,
          months_selling: 60,
          proof_of_billing_path: "p",
          references: [{ name: "a", contact: "b" }],
          ewallet_number: "1",
          email: "e",
          ocr_id_check: {
            idNumberFound: true,
            typeKeywordFound: true,
            textPreview: "",
            ranAt: "",
          },
        },
        locationConsent: true,
      }),
    );
    expect(s.recommendedLimitCentavos).toBeLessThanOrEqual(
      BUYER_CONFIG.maxLimitCentavos,
    );
  });
});

describe("yearsSelling", () => {
  it("parses a year out of free text", () => {
    expect(yearsSelling("2021", 2026)).toBe(5);
    expect(yearsSelling("since 2019", 2026)).toBe(7);
    expect(yearsSelling("kahapon lang", 2026)).toBeNull();
    expect(yearsSelling(null, 2026)).toBeNull();
    expect(yearsSelling("2030", 2026)).toBeNull(); // future = garbage
  });
});

describe("scoreSeller", () => {
  it("is deterministic", () => {
    const input = sellerInput({ sellsWhat: "phones", sellingSince: "2020" });
    expect(scoreSeller(input)).toEqual(scoreSeller(input));
  });

  it("scores a fully-verified veteran seller into band A with a raised cap", () => {
    const s = scoreSeller(
      sellerInput({
        sellsWhat: "phones & accessories",
        socialHandle: "@shop",
        marketplaceUrl: "https://shopee.ph/shop",
        sellingSince: "2019",
        idType: "philsys",
        hasStorefrontPin: true,
        locationConsent: true,
      }),
    );
    expect(s.band).toBe("A");
    expect(s.recommendedCapCentavos).toBe(750_000); // 1.5 × new cap
    expect(s.recommendedReservePct).toBe(7.5); // 10 − 2.5
  });

  it("a bare-minimum application lands low with a reduced cap + stiffer reserve", () => {
    const s = scoreSeller(sellerInput({ idType: "other" }));
    expect(s.band === "D" || s.band === "E").toBe(true);
    expect(s.recommendedCapCentavos).toBeLessThan(SELLER_CONFIG.capNewCentavos);
    expect(s.recommendedReservePct).toBe(15); // 10 + 5
  });

  it("never recommends above the trusted cap", () => {
    const s = scoreSeller(
      sellerInput({
        sellsWhat: "x",
        socialHandle: "x",
        marketplaceUrl: "x",
        sellingSince: "2010",
        idType: "philsys",
        hasStorefrontPin: true,
        locationConsent: true,
        config: { ...SELLER_CONFIG, capNewCentavos: 4_000_000 },
      }),
    );
    expect(s.recommendedCapCentavos).toBeLessThanOrEqual(
      SELLER_CONFIG.capTrustedCentavos,
    );
  });

  it("fraud flags drop the band and force careful review", () => {
    const clean = sellerInput({
      sellsWhat: "ukay",
      sellingSince: "2022",
      idType: "umid",
      hasStorefrontPin: true,
    });
    const flagged = scoreSeller({
      ...clean,
      fraudFlags: ["Shared contact number with 1 other account(s)"],
    });
    expect(flagged.score).toBe(scoreSeller(clean).score - 15);
    expect(flagged.reviewCarefully).toBe(true);
  });
});
