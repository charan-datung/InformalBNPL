import { cn } from "@/lib/cn";

/** White surface that lifts off the tinted canvas. The app's default container. */
export default function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm shadow-brand-950/[0.03]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
