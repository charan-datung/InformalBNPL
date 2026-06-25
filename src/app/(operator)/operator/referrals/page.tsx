import QRCode from "qrcode";
import {
  listSellerReferralRewards,
  type ReferralStatus,
} from "@/lib/referrals/seller-referrals";
import { markReferralPaidAction } from "@/app/(operator)/operator/actions";
import { getRequestOrigin } from "@/lib/http/origin";
import CopyButton from "@/app/(public)/charge/[id]/CopyButton";
import { formatPeso, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<ReferralStatus, { label: string; cls: string }> = {
  pending: { label: "Awaiting first sale", cls: "bg-slate-200 text-slate-800" },
  qualified: { label: "Bounty owed", cls: "bg-amber-200 text-amber-900" },
  paid: { label: "Paid", cls: "bg-green-200 text-green-900" },
  void: { label: "Void", cls: "bg-gray-200 text-gray-700" },
};

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [rows, origin, { error }] = await Promise.all([
    listSellerReferralRewards(),
    getRequestOrigin(),
    searchParams,
  ]);

  const sellerSignupUrl = `${origin}/signup?intent=seller`;
  const qrSvg = await QRCode.toString(sellerSignupUrl, {
    type: "svg",
    margin: 1,
    color: { dark: "#0e4d45", light: "#ffffff" },
  });

  const owed = rows
    .filter((r) => r.status === "qualified")
    .reduce((s, r) => s + (r.rewardCentavos ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Seller referrals</h1>
        <p className="text-sm text-black/55">
          Invite new sellers with the generic link, and settle the bounties
          sellers earn for referring others.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* Generic seller-acquisition link to copy and send to prospects. */}
      <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
        <h2 className="text-sm font-semibold text-brand-800">
          Invite a seller
        </h2>
        <p className="mb-3 mt-0.5 text-xs text-black/55">
          Send this to a prospective seller. It drops them straight into seller
          verification.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div
            className="size-28 shrink-0 rounded-lg border border-black/10 bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="w-full space-y-1">
            <span className="text-xs font-medium text-black/55">
              Seller sign-up link
            </span>
            <CopyButton text={sellerSignupUrl} />
          </div>
        </div>
      </div>

      {/* Rewards ledger */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-black/55">
          Referral rewards ({rows.length})
        </h2>
        {owed > 0 ? (
          <span className="text-sm font-medium text-amber-700">
            {formatPeso(owed)} owed
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-black/55">
          No seller referrals yet. When a seller refers another seller who
          completes their first order, the bounty appears here to settle.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 bg-black/[0.02] text-xs">
              <tr>
                <Th>Referrer</Th>
                <Th>Referred seller</Th>
                <Th>Status</Th>
                <Th right>Bounty</Th>
                <Th>Qualified</Th>
                <Th right>Action</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = STATUS_BADGE[r.status];
                return (
                  <tr key={r.id} className="border-b border-black/5 last:border-0">
                    <Td>
                      <div className="font-medium">{r.referrerName ?? "—"}</div>
                      <div className="text-xs text-black/45">
                        {r.referrerContact ?? ""}
                      </div>
                    </Td>
                    <Td>
                      <div className="font-medium">{r.referredName ?? "—"}</div>
                      <div className="text-xs text-black/45">
                        {r.referredContact ?? ""}
                      </div>
                    </Td>
                    <Td>
                      <span
                        className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </Td>
                    <Td right>
                      {r.rewardCentavos != null ? formatPeso(r.rewardCentavos) : "—"}
                    </Td>
                    <Td>
                      {r.qualifiedAt ? formatDateTime(r.qualifiedAt) : "—"}
                    </Td>
                    <Td right>
                      {r.status === "qualified" ? (
                        <form action={markReferralPaidAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                          >
                            Mark paid
                          </button>
                        </form>
                      ) : r.status === "paid" && r.paidAt ? (
                        <span className="text-xs text-black/45">
                          {formatDateTime(r.paidAt)}
                        </span>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 font-medium text-black/55 ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={`px-3 py-2 align-top ${right ? "text-right" : "text-left"}`}>
      {children}
    </td>
  );
}
