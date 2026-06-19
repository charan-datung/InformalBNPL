"use client";

import { useState } from "react";

/**
 * Active-dashboard panels and the Buy/Sell mode toggle.
 *
 * Features aren't built yet, so the panels are placeholders — the point here is
 * that a single identity with BOTH capabilities approved can switch modes
 * cleanly. Single-capability users render just the one panel (no toggle).
 */

export function BuyerPanel() {
  return (
    <div className="rounded-lg border border-black/10 p-5 dark:border-white/10">
      <h2 className="font-semibold">Buying</h2>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        You&apos;re approved to buy. Purchases and repayment schedules will show
        up here. Nothing yet.
      </p>
    </div>
  );
}

export function SellerPanel() {
  return (
    <div className="rounded-lg border border-black/10 p-5 dark:border-white/10">
      <h2 className="font-semibold">Selling</h2>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        You&apos;re approved to sell. Listings, orders, and payouts will show up
        here. Nothing yet.
      </p>
    </div>
  );
}

type Mode = "buy" | "sell";

export default function DashboardModes() {
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

      {mode === "buy" ? <BuyerPanel /> : <SellerPanel />}
    </div>
  );
}
