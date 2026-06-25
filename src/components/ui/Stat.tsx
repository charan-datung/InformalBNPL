import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Headline metric tiles — the at-a-glance numbers fintech dashboards lead with.
 * Server-renderable (no client JS). Use <StatGrid> to lay several out, and the
 * `tone` to flag a number that needs attention (amber for money owed, etc.).
 */

type Tone = "default" | "brand" | "accent" | "amber";

const tones: Record<Tone, { wrap: string; label: string; value: string; icon: string }> = {
  default: {
    wrap: "border-black/[0.07] bg-white",
    label: "text-black/45",
    value: "text-foreground",
    icon: "text-black/30",
  },
  brand: {
    wrap: "border-brand-100 bg-brand-50/60",
    label: "text-brand-700/70",
    value: "text-brand-900",
    icon: "text-brand-500",
  },
  accent: {
    wrap: "border-accent-200 bg-accent-50/60",
    label: "text-accent-700/80",
    value: "text-accent-900",
    icon: "text-accent-600",
  },
  amber: {
    wrap: "border-amber-200 bg-amber-50",
    label: "text-amber-700",
    value: "text-amber-900",
    icon: "text-amber-500",
  },
};

export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  const s = tones[tone];
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm shadow-brand-950/[0.03]",
        s.wrap,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-[11px] font-medium uppercase tracking-wide",
            s.label,
          )}
        >
          {label}
        </span>
        {Icon ? <Icon className={cn("size-4 shrink-0", s.icon)} /> : null}
      </div>
      <div className={cn("mt-1.5 text-xl font-bold tabular-nums", s.value)}>
        {value}
      </div>
      {hint ? (
        <div className={cn("mt-0.5 text-[11px]", s.label)}>{hint}</div>
      ) : null}
    </div>
  );
}
