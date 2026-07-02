import type { ScoreBand, ScoreReason } from "@/lib/credit/scoring";

/**
 * Operator-facing scorecard readout for a pending application: the band chip,
 * the numeric score, and every reason with its signed points — so the operator
 * sees exactly why the algorithm recommends what it does. Display only; the
 * decision (and the prefilled inputs it feeds) stays with the human.
 */

const BAND_STYLES: Record<ScoreBand, string> = {
  A: "bg-green-600/10 text-green-700 dark:text-green-400",
  B: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  C: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  D: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  E: "bg-red-600/10 text-red-700 dark:text-red-400",
};

const BAND_LABELS: Record<ScoreBand, string> = {
  A: "Strong",
  B: "Good",
  C: "Fair",
  D: "Weak",
  E: "Decline / manual",
};

export default function ScorePanel({
  score,
  band,
  reasons,
  recommendation,
  reviewCarefully,
}: {
  score: number;
  band: ScoreBand;
  reasons: ScoreReason[];
  /** One-line summary of what the scorecard suggests (already prefilled below). */
  recommendation: string;
  reviewCarefully: boolean;
}) {
  return (
    <div className="mt-3 rounded border border-black/10 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold">Credit score</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${BAND_STYLES[band]}`}
        >
          {band} · {BAND_LABELS[band]}
        </span>
        <span className="text-xs tabular-nums text-black/60 dark:text-white/60">
          {score}/100
        </span>
        {reviewCarefully ? (
          <span className="rounded bg-red-600/10 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">
            review carefully
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-xs text-black/60 dark:text-white/60">
        Suggests: <span className="font-medium">{recommendation}</span> — inputs
        below are prefilled; adjust as you see fit.
      </p>

      <details className="mt-1.5">
        <summary className="cursor-pointer text-[11px] font-medium text-black/50 dark:text-white/50">
          Why this score ({reasons.length} factors)
        </summary>
        <ul className="mt-1 space-y-0.5">
          {reasons.map((r, i) => (
            <li
              key={i}
              className="flex justify-between gap-3 text-[11px] text-black/60 dark:text-white/60"
            >
              <span>{r.label}</span>
              <span
                className={`tabular-nums ${
                  r.points < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-black/45 dark:text-white/45"
                }`}
              >
                {r.points > 0 ? `+${r.points}` : r.points}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
