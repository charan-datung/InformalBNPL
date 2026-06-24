import { listPendingSellers, type PendingSeller } from "@/lib/operator/queries";
import { reviewSellerAction } from "@/app/(operator)/operator/actions";
import {
  runSellerIdOcr,
  runSellerStorefrontOcr,
} from "@/app/(operator)/operator/reviews/sellers/ocr-actions";
import { getConfig } from "@/lib/config/system-config";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const ID_TYPE_LABELS: Record<string, string> = {
  philsys: "PhilSys / National ID",
  drivers_license: "Driver's license",
  passport: "Passport",
  umid: "UMID",
  postal_id: "Postal ID",
  other: "Other government ID",
};

function Signal({ label, url }: { label: string; url: string | null }) {
  return (
    <figure className="space-y-1">
      <figcaption className="text-[11px] font-medium text-black/50 dark:text-white/50">
        {label}
      </figcaption>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="h-28 w-28 rounded-md border border-black/10 object-cover dark:border-white/10"
          />
        </a>
      ) : (
        <div className="flex h-28 w-28 items-center justify-center rounded-md border border-dashed border-black/20 text-xs text-black/40 dark:border-white/20 dark:text-white/40">
          none
        </div>
      )}
    </figure>
  );
}

export default async function SellerReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [sellers, config] = await Promise.all([listPendingSellers(), getConfig()]);

  const defaultReservePct = config.seller_reserve_new_pct;
  const defaultCapPesos = Math.round(config.seller_cap_new_centavos / 100);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        Pending seller verifications ({sellers.length})
      </h1>
      <p className="text-sm text-black/55 dark:text-white/55">
        No business documents — verify a real person and a real selling presence
        from the ID, storefront, and social proof below.
      </p>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {sellers.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No pending seller verifications.
        </p>
      ) : (
        <div className="space-y-4">
          {sellers.map((s: PendingSeller) => {
            const mapHref =
              s.storefront_lat != null && s.storefront_lng != null
                ? `https://www.google.com/maps?q=${s.storefront_lat},${s.storefront_lng}`
                : null;
            return (
              <form
                key={s.user_id}
                action={reviewSellerAction}
                className="rounded-lg border border-black/10 p-4 dark:border-white/10"
              >
                <input type="hidden" name="userId" value={s.user_id} />

                <div className="flex flex-wrap gap-3">
                  <Signal label="Government ID" url={s.idUrl} />
                  <Signal label="Storefront / stall" url={s.storefrontUrl} />
                  <Signal label="Live item" url={s.photoUrl} />
                </div>

                {/* OCR (Tesseract) — runs server-side on demand */}
                <div className="mt-3 space-y-2 rounded border border-black/10 p-3 dark:border-white/10">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      formAction={runSellerIdOcr}
                      className="rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.04]"
                    >
                      Run ID OCR
                    </button>
                    <button
                      type="submit"
                      formAction={runSellerStorefrontOcr}
                      className="rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.04]"
                    >
                      Run storefront OCR
                    </button>
                  </div>
                  {s.ocrIdText ? (
                    <p className="text-[11px] text-black/55 dark:text-white/55">
                      <span className="font-semibold">ID text:</span> “{s.ocrIdText}”
                    </p>
                  ) : null}
                  {s.ocrStorefrontText ? (
                    <p className="text-[11px] text-black/55 dark:text-white/55">
                      <span className="font-semibold">Storefront text:</span> “
                      {s.ocrStorefrontText}”
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 space-y-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-black/60 dark:text-white/60">
                    {s.contact ?? "no contact"} · ID:{" "}
                    {s.id_type ? (ID_TYPE_LABELS[s.id_type] ?? s.id_type) : "—"} · applied{" "}
                    {formatDateTime(s.created_at)}
                  </div>
                  <div className="text-xs text-black/60 dark:text-white/60">
                    Sells as <strong>{s.social_handle ?? "—"}</strong>
                    {s.marketplace_url ? (
                      <>
                        {" · "}
                        <a
                          href={s.marketplace_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          marketplace
                        </a>
                      </>
                    ) : null}
                    {s.selling_since ? ` · since ${s.selling_since}` : ""}
                  </div>
                  <div className="text-xs text-black/60 dark:text-white/60">
                    📍 {s.storefront_location ?? "no location"}
                    {mapHref ? (
                      <>
                        {" · "}
                        <a
                          href={mapHref}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          map
                        </a>
                      </>
                    ) : null}
                  </div>
                  {s.verification_notes ? (
                    <p className="mt-2 whitespace-pre-wrap rounded bg-black/[0.03] p-2 text-sm dark:bg-white/[0.04]">
                      {s.verification_notes}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">Trust tier</span>
                    <select
                      name="trust_tier"
                      defaultValue="new"
                      className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
                    >
                      <option value="new">new</option>
                      <option value="trusted">trusted</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">Reserve %</span>
                    <input
                      type="number"
                      name="reserve_pct"
                      min={0}
                      max={100}
                      step="0.5"
                      defaultValue={defaultReservePct}
                      className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">Cap ₱</span>
                    <input
                      type="number"
                      name="max_outstanding_pesos"
                      min={0}
                      step="100"
                      defaultValue={defaultCapPesos}
                      className="w-full rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium">Notes</span>
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
