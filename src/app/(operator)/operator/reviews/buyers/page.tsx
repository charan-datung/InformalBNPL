import { listPendingBuyers } from "@/lib/operator/queries";
import { reviewBuyerAction } from "@/app/(operator)/operator/actions";
import {
  runBuyerIdOcr,
  runBuyerBillingOcr,
} from "@/app/(operator)/operator/reviews/buyers/ocr-actions";
import type { BuyerApplication } from "@/lib/profiles/buyer-application";
import { getConfig } from "@/lib/config/system-config";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Pretty-print the application JSONB as labeled rows (money in centavos -> ₱). */
function ApplicationDetails({ app }: { app: Record<string, unknown> | null }) {
  if (!app) {
    return (
      <p className="text-sm text-black/40 dark:text-white/40">
        (no application details)
      </p>
    );
  }
  const money = (k: string) =>
    typeof app[k] === "number" ? formatPeso(app[k] as number) : null;

  const rows: [string, string | null][] = [
    ["DOB", (app.date_of_birth as string) ?? null],
    [
      "Location",
      [app.city, app.province].filter(Boolean).join(", ") || null,
    ],
    ["Email", (app.email as string) ?? null],
    ["ID", [app.id_type, app.id_number].filter(Boolean).join(" · ") || null],
    ["Sells", (app.product_category as string) ?? null],
    [
      "Channels",
      Array.isArray(app.sell_channels) && app.sell_channels.length
        ? (app.sell_channels as string[]).join(", ")
        : null,
    ],
    ["Handles", (app.social_handles as string) ?? null],
    [
      "Months selling",
      app.months_selling != null ? String(app.months_selling) : null,
    ],
    ["Monthly sales", money("monthly_sales_centavos")],
    [
      "Sourcing",
      Array.isArray(app.sourcing) && app.sourcing.length
        ? (app.sourcing as string[]).join(", ")
        : null,
    ],
    ["Restocks", (app.restock_frequency as string) ?? null],
    ["Typical restock", money("typical_restock_centavos")],
    ["Employment", (app.employment_status as string) ?? null],
    ["Occupation", (app.occupation as string) ?? null],
    ["Monthly income", money("monthly_income_centavos")],
    ["Other income", money("other_income_centavos")],
    ["Existing loan/mo", money("existing_loan_monthly_centavos")],
    [
      "E-wallet",
      [app.ewallet_provider, app.ewallet_number].filter(Boolean).join(" ") ||
        null,
    ],
    [
      "Bank",
      [app.bank_name, app.bank_account_number, app.bank_account_name]
        .filter(Boolean)
        .join(" · ") || null,
    ],
  ];

  const refs = Array.isArray(app.references)
    ? (app.references as { name?: string; contact?: string }[])
    : [];

  return (
    <div className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="text-black/45 dark:text-white/45">{k}</span>
            <span className="text-right font-medium">{v}</span>
          </div>
        ))}
      {refs.length > 0 ? (
        <div className="sm:col-span-2">
          <span className="text-black/45 dark:text-white/45">References: </span>
          {refs
            .map((r) => [r.name, r.contact].filter(Boolean).join(" "))
            .filter(Boolean)
            .join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

export default async function BuyerReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [buyers, config] = await Promise.all([listPendingBuyers(), getConfig()]);

  // Default credit limit prefilled from system_config (pesos).
  const defaultLimitPesos = config.default_credit_limit_centavos / 100;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        Pending buyer applications ({buyers.length})
      </h1>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {buyers.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No pending buyer applications.
        </p>
      ) : (
        <div className="space-y-4">
          {buyers.map((b) => {
            const app = b.application as BuyerApplication | null;
            const idCheck = app?.ocr_id_check;
            const billingPreview = app?.ocr_billing_preview;
            return (
            <form
              key={b.user_id}
              action={reviewBuyerAction}
              className="rounded-lg border border-black/10 p-4 dark:border-white/10"
            >
              <input type="hidden" name="userId" value={b.user_id} />

              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{b.name}</span>
                    {b.buyer_kind ? (
                      <span className="rounded bg-black/10 px-1.5 py-0.5 text-[11px] font-medium dark:bg-white/10">
                        {b.buyer_kind}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-black/60 dark:text-white/60">
                    {b.contact ?? "no contact"} · applied{" "}
                    {formatDateTime(b.created_at)}
                  </div>
                  <div className="mt-0.5 text-xs text-black/60 dark:text-white/60">
                    Pre-approved limit:{" "}
                    <span className="font-medium">
                      {formatPeso(
                        b.requested_amount_centavos ?? config.default_credit_limit_centavos,
                      )}
                    </span>{" "}
                    — verify identity, adjust only for risk
                  </div>
                </div>
                {b.idPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.idPhotoUrl}
                    alt="Government ID"
                    className="h-24 w-36 rounded-md border border-black/10 object-cover dark:border-white/10"
                  />
                ) : (
                  <div className="flex h-24 w-36 items-center justify-center rounded-md border border-dashed border-black/20 text-xs text-black/40 dark:border-white/20 dark:text-white/40">
                    no ID
                  </div>
                )}
              </div>

              <div className="mt-3 rounded bg-black/[0.03] p-3 dark:bg-white/[0.04]">
                <ApplicationDetails app={b.application} />
              </div>

              {/* OCR verification — runs server-side on demand */}
              <div className="mt-3 space-y-2 rounded border border-black/10 p-3 dark:border-white/10">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold">ID OCR check</span>
                  <button
                    type="submit"
                    formAction={runBuyerIdOcr}
                    className="rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.04]"
                  >
                    Run ID OCR
                  </button>
                  {idCheck ? (
                    <span className="text-xs">
                      {idCheck.idNumberFound ? "✓" : "✗"} ID number ·{" "}
                      {idCheck.typeKeywordFound ? "✓" : "✗"} ID type
                    </span>
                  ) : (
                    <span className="text-xs text-black/40 dark:text-white/40">not run</span>
                  )}
                </div>
                {idCheck?.textPreview ? (
                  <p className="line-clamp-2 text-[11px] text-black/50 dark:text-white/50">
                    “{idCheck.textPreview}”
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs font-semibold">Proof of billing</span>
                  {b.proofUrl ? (
                    <a href={b.proofUrl} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={b.proofUrl}
                        alt="Proof of billing"
                        className="h-12 w-16 rounded border border-black/10 object-cover dark:border-white/10"
                      />
                    </a>
                  ) : (
                    <span className="text-xs text-black/40 dark:text-white/40">
                      none uploaded
                    </span>
                  )}
                  {b.proofUrl ? (
                    <button
                      type="submit"
                      formAction={runBuyerBillingOcr}
                      className="rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.04]"
                    >
                      Run billing OCR
                    </button>
                  ) : null}
                </div>
                {billingPreview ? (
                  <p className="line-clamp-2 text-[11px] text-black/50 dark:text-white/50">
                    “{billingPreview}”
                  </p>
                ) : null}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium">
                    Credit limit (PHP)
                  </span>
                  <input
                    type="number"
                    name="credit_limit_pesos"
                    min={0}
                    step="1"
                    defaultValue={
                      b.requested_amount_centavos != null
                        ? b.requested_amount_centavos / 100
                        : defaultLimitPesos
                    }
                    className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">
                    Underwriting notes
                  </span>
                  <input
                    type="text"
                    name="notes"
                    placeholder="Reason / conditions"
                    className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
                  />
                </label>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="submit"
                  name="decision"
                  value="approve"
                  className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
                >
                  Approve
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="reject"
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  Reject
                </button>
              </div>
            </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
