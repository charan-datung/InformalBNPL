"use client";

import { useState, type ReactNode } from "react";

/**
 * Buy/Sell mode toggle for an identity with BOTH capabilities approved. The two
 * panels are rendered on the server and passed in as props; this only switches
 * which one is shown. Single-capability users don't render this at all.
 */
type Mode = "buy" | "sell";

export default function DashboardModes({
  buyer,
  seller,
}: {
  buyer: ReactNode;
  seller: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("buy");

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Dashboard mode"
        className="inline-flex rounded-lg border border-black/15 p-1 text-sm dark:border-white/15"
      >
        <button
          role="tab"
          aria-selected={mode === "buy"}
          onClick={() => setMode("buy")}
          className={`rounded-md px-4 py-1.5 font-medium ${
            mode === "buy"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "text-black/60 dark:text-white/60"
          }`}
        >
          Buy
        </button>
        <button
          role="tab"
          aria-selected={mode === "sell"}
          onClick={() => setMode("sell")}
          className={`rounded-md px-4 py-1.5 font-medium ${
            mode === "sell"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "text-black/60 dark:text-white/60"
          }`}
        >
          Sell
        </button>
      </div>

      {mode === "buy" ? buyer : seller}
    </div>
  );
}
