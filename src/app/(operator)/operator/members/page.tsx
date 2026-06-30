import { Suspense } from "react";
import {
  listApprovedBuyers,
  listApprovedSellers,
  type ApprovedBuyer,
  type ApprovedSeller,
} from "@/lib/operator/queries";
import { formatPeso, formatDateTime } from "@/lib/format";
import { CardSkeleton } from "@/components/brand/Skeleton";
import { getRequestOrigin } from "@/lib/http/origin";
import BuyerInviteCard from "@/components/invite/BuyerInviteCard";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  personal: "Personal",
  business: "Business",
};

/**
 * Operator directory of approved members. Two independently-streamed sections —
 * approved buyers (with their revolving credit line + live exposure) and
 * approved sellers (trust tier, reserve, exposure cap + live usage) — so the
 * back office can see who's active and how much room each has at a glance.
 */
export default function MembersPage() {
  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Approved members</h1>
        <p className="text-sm text-black/55 dark:text-white/55">
          Everyone who has passed verification, with their underwriting and live
          exposure.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Buyers
        </h2>
        <Suspense fallback={<CardSkeleton rows={4} />}>
          <BuyersTable />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-black/50 dark:text-white/50">
          Sellers
        </h2>
        <Suspense fallback={<CardSkeleton rows={4} />}>
          <SellersTable />
        </Suspense>
      </section>
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2 font-medium text-black/50 dark:text-white/50 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 ${right ? "text-right tabular-nums" : ""}`}
    >
      {children}
    </td>
  );
}

async function BuyersTable() {
  const buyers = await listApprovedBuyers();
  if (buyers.length === 0) {
    return (
      <p className="text-sm text-black/55 dark:text-white/55">
        No approved buyers yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full text-sm">
        <thead className="border-b border-black/10 bg-black/[0.02] text-xs dark:border-white/10 dark:bg-white/[0.03]">
          <tr>
            <Th>Name</Th>
            <Th>Contact</Th>
            <Th>Type</Th>
            <Th right>Credit limit</Th>
            <Th right>Outstanding</Th>
            <Th right>Available</Th>
            <Th right>Loans</Th>
            <Th>Approved</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {buyers.map((b: ApprovedBuyer) => (
            <tr key={b.user_id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
              <Td>{b.name}</Td>
              <Td>{b.contact ?? "—"}</Td>
              <Td>{b.buyer_kind ? (KIND_LABELS[b.buyer_kind] ?? b.buyer_kind) : "—"}</Td>
              <Td right>{formatPeso(b.credit_limit_centavos)}</Td>
              <Td right>{formatPeso(b.outstanding_centavos)}</Td>
              <Td right>{formatPeso(b.available_centavos)}</Td>
              <Td right>{b.loan_count}</Td>
              <Td>{formatDateTime(b.approved_at)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function SellersTable() {
  const [sellers, origin] = await Promise.all([
    listApprovedSellers(),
    getRequestOrigin(),
  ]);
  if (sellers.length === 0) {
    return (
      <p className="text-sm text-black/55 dark:text-white/55">
        No approved sellers yet.
      </p>
    );
  }
  return (
    <div className="space-y-6">
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full text-sm">
        <thead className="border-b border-black/10 bg-black/[0.02] text-xs dark:border-white/10 dark:bg-white/[0.03]">
          <tr>
            <Th>Name</Th>
            <Th>Contact</Th>
            <Th>Sells</Th>
            <Th>Location</Th>
            <Th>Tier</Th>
            <Th right>Reserve</Th>
            <Th right>Exposure cap</Th>
            <Th right>Outstanding</Th>
            <Th right>Available</Th>
            <Th right>Loans</Th>
            <Th>Approved</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {sellers.map((s: ApprovedSeller) => (
            <tr key={s.user_id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
              <Td>{s.name}</Td>
              <Td>{s.contact ?? "—"}</Td>
              <Td>
                <div className="max-w-[220px] whitespace-normal">
                  <div className="font-medium">{s.sells_what ?? "—"}</div>
                  {s.social_handle || s.marketplace_url ? (
                    <div className="text-[11px] text-black/45 dark:text-white/45">
                      {s.marketplace_url ? (
                        <a
                          href={s.marketplace_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {s.social_handle ?? "online shop"}
                        </a>
                      ) : (
                        s.social_handle
                      )}
                    </div>
                  ) : null}
                </div>
              </Td>
              <Td>{s.storefront_location ?? "—"}</Td>
              <Td>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    s.trust_tier === "trusted"
                      ? "bg-green-600/10 text-green-700 dark:text-green-400"
                      : "bg-black/[0.06] text-black/60 dark:bg-white/10 dark:text-white/60"
                  }`}
                >
                  {s.trust_tier}
                </span>
              </Td>
              <Td right>{s.rolling_reserve_pct}%</Td>
              <Td right>{formatPeso(s.max_outstanding_centavos)}</Td>
              <Td right>{formatPeso(s.outstanding_centavos)}</Td>
              <Td right>{formatPeso(s.available_centavos)}</Td>
              <Td right>{s.loan_count}</Td>
              <Td>{formatDateTime(s.approved_at)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-medium text-black/50 dark:text-white/50">
          Buyer invite links — share a seller’s QR or link so their customers can
          sign up for credit
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sellers.map((s: ApprovedSeller) => (
            <BuyerInviteCard
              key={s.user_id}
              origin={origin}
              sellerUserId={s.user_id}
              label={s.name}
              qrSize={120}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
