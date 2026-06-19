/**
 * Dispute / auto-release window.
 *
 * Single source of truth for "how long after shipment can a buyer dispute":
 * `dispute_window_days` from system_config (admin-editable). The window starts
 * when the loan is marked `shipped`.
 *
 * There is NO cron in the pilot: this is computed on demand (when the operator
 * console or a dashboard renders) from the shipped timestamp + the configured
 * days. See README "Auto-release" for how to move this to a scheduled job.
 */

export type DisputeWindow =
  | { applicable: false }
  | { applicable: true; endsAt: Date; elapsed: boolean; daysLeft: number };

const DAY_MS = 24 * 60 * 60 * 1000;

export function disputeWindow(
  shippedAt: string | null | undefined,
  disputeWindowDays: number,
  now: Date = new Date(),
): DisputeWindow {
  if (!shippedAt) return { applicable: false };

  const endsAt = new Date(shippedAt);
  endsAt.setDate(endsAt.getDate() + disputeWindowDays);

  const elapsed = now.getTime() >= endsAt.getTime();
  const daysLeft = Math.max(
    0,
    Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS),
  );
  return { applicable: true, endsAt, elapsed, daysLeft };
}
