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

export function StatusBadge({
  status,
  audience = "operator",
}: {
  status: LoanStatus;
  /** "customer" swaps in warm, plain-English labels for buyer/seller screens;
   *  operators/admins keep the precise STATUS_STYLES labels. */
  audience?: "operator" | "customer";
}) {
  const base = STATUS_STYLES[status] ?? {
    label: status,
    cls: "bg-gray-200 text-gray-800",
  };
  const label =
    audience === "customer" ? (CUSTOMER_LABELS[status] ?? base.label) : base.label;
  const cls =
    audience === "customer" ? (CUSTOMER_STYLES[status] ?? base.cls) : base.cls;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {audience === "customer" ? (
        <span className="size-1.5 rounded-full bg-current opacity-60" />
      ) : null}
      {label}
    </span>
  );
}

/**
 * Softer, on-brand badge colours for the consumer surface. The operator palette
 * (saturated slate/blue/indigo) is too cold for buyers/sellers, so customer
 * screens get muted -50/-700 pairings keyed to the brand/accent system.
 */
const CUSTOMER_STYLES: Partial<Record<LoanStatus, string>> = {
  booked: "bg-black/[0.05] text-black/60",
  escrow_held: "bg-brand-50 text-brand-700",
  shipped: "bg-brand-50 text-brand-700",
  delivered_confirmed: "bg-accent-50 text-accent-700",
  dispute_raised: "bg-red-50 text-red-700",
  auto_released: "bg-accent-50 text-accent-700",
  escrow_released: "bg-accent-50 text-accent-700",
  repaying: "bg-brand-50 text-brand-700",
  settled: "bg-accent-100 text-accent-800",
  refunded: "bg-amber-50 text-amber-700",
  frozen_fraud_review: "bg-amber-50 text-amber-700",
};

/**
 * Plain-English, reassuring labels for buyers and sellers. Deliberately avoids
 * "escrow", "loan", "fraud" and other cold/scary terms. Operators still see the
 * precise STATUS_STYLES labels above.
 */
const CUSTOMER_LABELS: Partial<Record<LoanStatus, string>> = {
  booked: "Order placed",
  escrow_held: "Payment kept safe",
  shipped: "On the way",
  delivered_confirmed: "Delivered",
  dispute_raised: "Problem reported",
  auto_released: "Released to seller",
  escrow_released: "Released to seller",
  repaying: "Paying in installments",
  settled: "Fully paid",
  refunded: "Refunded",
  frozen_fraud_review: "On hold",
};
