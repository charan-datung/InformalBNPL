"use client";

import { useState, type ReactNode } from "react";
import { ShoppingBag, Store } from "lucide-react";
import { cn } from "@/lib/cn";

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
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Dashboard mode"
        className="grid grid-cols-2 gap-1 rounded-2xl border border-black/[0.07] bg-white p-1 shadow-sm"
      >
        {(
          [
            ["buy", "Buy", ShoppingBag],
            ["sell", "Sell", Store],
          ] as [Mode, string, typeof ShoppingBag][]
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              mode === value
                ? "bg-brand-700 text-white shadow-sm"
                : "text-black/55 hover:bg-black/[0.03]",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {mode === "buy" ? buyer : seller}
    </div>
  );
}
