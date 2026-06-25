"use client";

import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type Choice = {
  value: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
};

/**
 * Radio group rendered as tappable cards — the friendly "pick one" control used
 * for the application's branch points (buy vs sell, e-wallet vs bank). Submits
 * the chosen value via a hidden radio under `name`, so it works in plain forms.
 */
export default function ChoiceCards({
  name,
  value,
  onChange,
  options,
  columns = 1,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: Choice[];
  columns?: 1 | 2;
}) {
  return (
    <div className={cn("grid gap-2.5", columns === 2 && "sm:grid-cols-2")}>
      {options.map((opt) => {
        const selected = value === opt.value;
        const Icon = opt.icon;
        return (
          <label
            key={opt.value}
            className={cn(
              "relative flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors",
              selected
                ? "border-brand-500 bg-brand-50/70 ring-1 ring-brand-500"
                : "border-black/10 bg-white hover:border-brand-200 hover:bg-brand-50/30",
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {Icon ? (
              <span
                className={cn(
                  "mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg",
                  selected ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-600",
                )}
              >
                <Icon className="size-4.5" />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{opt.label}</p>
              {opt.description ? (
                <p className="mt-0.5 text-xs leading-relaxed text-black/50">
                  {opt.description}
                </p>
              ) : null}
            </div>
            <span
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
                selected
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-black/20 bg-white",
              )}
            >
              {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
