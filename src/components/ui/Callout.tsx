import {
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "error";

const styles: Record<Tone, { wrap: string; icon: string; Icon: LucideIcon }> = {
  info: {
    wrap: "border-brand-100 bg-brand-50/70 text-brand-900",
    icon: "text-brand-600",
    Icon: Info,
  },
  success: {
    wrap: "border-accent-200 bg-accent-50/70 text-accent-900",
    icon: "text-accent-600",
    Icon: CheckCircle2,
  },
  warning: {
    wrap: "border-amber-200 bg-amber-50 text-amber-900",
    icon: "text-amber-600",
    Icon: AlertTriangle,
  },
  error: {
    wrap: "border-red-200 bg-red-50 text-red-800",
    icon: "text-red-600",
    Icon: XCircle,
  },
};

/** Inline status/notice block with a leading icon. One tone vocabulary app-wide. */
export default function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const s = styles[tone];
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm",
        s.wrap,
        className,
      )}
    >
      <s.Icon className={cn("mt-0.5 size-4.5 shrink-0", s.icon)} />
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-[13px] leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}
