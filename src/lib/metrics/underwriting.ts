import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Underwriting metrics — aggregates the buyer application data the operator
 * currently underwrites BY HAND, into the signals a future automated scorecard
 * will need (credit-bureau pulls + internal logic). Definitions:
 *
 *  - Approval rate   = verified ÷ (verified + rejected)  [decided apps only].
 *  - Requested/Approved = applicant's asked amount vs the credit limit granted.
 *  - Cash flow       = monthly sales (business) or income (personal) + other
 *                      income, banded.
 *  - Exposure ratio  = requested amount ÷ monthly cash flow. A months-of-income
 *                      style affordability signal — the core input a scorecard
 *                      would threshold on.
 *  - Sourcing / channels = where business applicants buy stock and sell, tallied
 *                      (alternative data, since informal merchants lack papers).
 *
 * Reads all buyer_profiles and reduces in JS — fine at pilot scale.
 */

export type Band = { label: string; count: number };

export type UnderwritingMetrics = {
  totalApplications: number;
  pending: number;
  verified: number;
  rejected: number;
  approvalRate: number | null;
  business: number;
  personal: number;
  requestedTotalCentavos: number;
  approvedTotalCentavos: number;
  avgRequestedCentavos: number | null;
  avgApprovedCentavos: number | null;
  approvedToRequestedRatio: number | null;
  withExistingLoans: number;
  cashflowBands: Band[];
  exposureBands: Band[];
  sourcing: Band[];
  channels: Band[];
};

const PESO = 100; // centavos per peso
const CASHFLOW_BANDS: [string, number, number][] = [
  ["< ₱10k", 0, 10_000 * PESO],
  ["₱10k–25k", 10_000 * PESO, 25_000 * PESO],
  ["₱25k–50k", 25_000 * PESO, 50_000 * PESO],
  ["₱50k–100k", 50_000 * PESO, 100_000 * PESO],
  ["≥ ₱100k", 100_000 * PESO, Infinity],
];
const EXPOSURE_BANDS: [string, number, number][] = [
  ["≤ 1× monthly", 0, 1],
  ["1–2×", 1, 2],
  ["2–4×", 2, 4],
  ["> 4×", 4, Infinity],
];

type App = Record<string, unknown> | null;
const numOf = (app: App, key: string): number | null => {
  const v = app?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/** Monthly cash flow in centavos: sales (business) or income (personal) + other. */
function cashflow(kind: string | null, app: App): number | null {
  const base =
    kind === "personal"
      ? numOf(app, "monthly_income_centavos")
      : numOf(app, "monthly_sales_centavos");
  if (base === null) return null;
  return base + (numOf(app, "other_income_centavos") ?? 0);
}

function tally(into: Map<string, number>, values: unknown) {
  if (!Array.isArray(values)) return;
  for (const v of values) {
    const key = String(v);
    into.set(key, (into.get(key) ?? 0) + 1);
  }
}

function bandify(
  defs: [string, number, number][],
  values: number[],
  unknown: number,
): Band[] {
  const out: Band[] = defs.map(([label, lo, hi]) => ({
    label,
    count: values.filter((v) => v >= lo && v < hi).length,
  }));
  out.push({ label: "Unknown", count: unknown });
  return out;
}

export async function computeUnderwriting(): Promise<UnderwritingMetrics> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("buyer_profiles")
    .select(
      "kyc_status, buyer_kind, credit_limit_centavos, requested_amount_centavos, application",
    );
  const rows = data ?? [];

  let pending = 0,
    verified = 0,
    rejected = 0,
    business = 0,
    personal = 0,
    withExistingLoans = 0,
    requestedTotal = 0,
    approvedTotal = 0,
    requestedCount = 0,
    approvedCount = 0,
    approvedRequestedTotal = 0;

  const cashflowVals: number[] = [];
  let cashflowUnknown = 0;
  const exposureVals: number[] = [];
  let exposureUnknown = 0;
  const sourcing = new Map<string, number>();
  const channels = new Map<string, number>();

  for (const r of rows) {
    const app = (r.application as App) ?? null;

    if (r.kyc_status === "pending") pending++;
    else if (r.kyc_status === "verified") verified++;
    else if (r.kyc_status === "rejected") rejected++;

    if (r.buyer_kind === "personal") personal++;
    else if (r.buyer_kind === "business") business++;

    const requested = r.requested_amount_centavos ?? null;
    if (typeof requested === "number") {
      requestedTotal += requested;
      requestedCount++;
    }
    if (r.kyc_status === "verified" && typeof r.credit_limit_centavos === "number") {
      approvedTotal += r.credit_limit_centavos;
      approvedCount++;
      if (typeof requested === "number") approvedRequestedTotal += requested;
    }

    if ((numOf(app, "existing_loan_monthly_centavos") ?? 0) > 0) withExistingLoans++;

    const cf = cashflow(r.buyer_kind, app);
    if (cf === null) cashflowUnknown++;
    else cashflowVals.push(cf);

    if (cf && cf > 0 && typeof requested === "number" && requested > 0) {
      exposureVals.push(requested / cf);
    } else {
      exposureUnknown++;
    }

    tally(sourcing, app?.sourcing);
    tally(channels, app?.sell_channels);
  }

  const decided = verified + rejected;
  const sortDesc = (m: Map<string, number>): Band[] =>
    [...m.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

  return {
    totalApplications: rows.length,
    pending,
    verified,
    rejected,
    approvalRate: decided > 0 ? verified / decided : null,
    business,
    personal,
    requestedTotalCentavos: requestedTotal,
    approvedTotalCentavos: approvedTotal,
    avgRequestedCentavos: requestedCount > 0 ? requestedTotal / requestedCount : null,
    avgApprovedCentavos: approvedCount > 0 ? approvedTotal / approvedCount : null,
    approvedToRequestedRatio:
      approvedRequestedTotal > 0 ? approvedTotal / approvedRequestedTotal : null,
    withExistingLoans,
    cashflowBands: bandify(CASHFLOW_BANDS, cashflowVals, cashflowUnknown),
    exposureBands: bandify(EXPOSURE_BANDS, exposureVals, exposureUnknown),
    sourcing: sortDesc(sourcing),
    channels: sortDesc(channels),
  };
}
