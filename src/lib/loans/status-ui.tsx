import type { LoanStatus } from "@/lib/loans/state-machine";

/** Human label + badge colours for each loan status (operator console). */
export const STATUS_STYLES: Record<LoanStatus, { label: string; cls: string }> = {
  booked: { label: "Booked", cls: "bg-slate-200 text-slate-800" },
  escrow_held: { label: "Escrow held", cls: "bg-blue-200 text-blue-900" },
  shipped: { label: "Shipped", cls: "bg-indigo-200 text-indigo-900" },
  delivered_confirmed: { label: "Delivered", cls: "bg-teal-200 text-teal-900" },
  dispute_raised: { label: "Dispute", cls: "bg-red-200 text-red-900" },
  auto_released: { label: "Auto-released", cls: "bg-amber-200 text-amber-900" },
  escrow_released: { label: "Escrow released", cls: "bg-green-200 text-green-900" },
  repaying: { label: "Repaying", cls: "bg-cyan-200 text-cyan-900" },
  settled: { label: "Settled", cls: "bg-emerald-300 text-emerald-950" },
  refunded: { label: "Refunded", cls: "bg-orange-200 text-orange-900" },
  frozen_fraud_review: { label: "Frozen (fraud)", cls: "bg-rose-300 text-rose-950" },
};

export function StatusBadge({ status }: { status: LoanStatus }) {
  const s = STATUS_STYLES[status] ?? {
    label: status,
    cls: "bg-gray-200 text-gray-800",
  };
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
