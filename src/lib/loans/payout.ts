import type { SellerLoanView } from "@/lib/loans/views";
import type { SystemConfig } from "@/lib/config/system-config";

/** Add `days` to an ISO timestamp, preserving the time. Null-safe. */
export function addDays(iso: string | null, days: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * When a seller can expect this order's payout, and whether it's committed
 * (escrow already released) or still an estimate. Mirrors the operator flow:
 * released → +payout days (committed); delivered → +payout days; shipped →
 * +auto-release window +payout days.
 */
export function sellerPayoutInfo(
  l: SellerLoanView,
  config: SystemConfig,
): { payoutDate: string | null; isEstimate: boolean } {
  if (l.releasedAt) {
    return {
      payoutDate: addDays(l.releasedAt, config.seller_payout_days),
      isEstimate: false,
    };
  }
  if (l.deliveredAt) {
    return {
      payoutDate: addDays(l.deliveredAt, config.seller_payout_days),
      isEstimate: true,
    };
  }
  if (l.shippedAt) {
    return {
      payoutDate: addDays(
        l.shippedAt,
        config.auto_release_days + config.seller_payout_days,
      ),
      isEstimate: true,
    };
  }
  return { payoutDate: null, isEstimate: true };
}
