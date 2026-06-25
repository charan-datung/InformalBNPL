import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold " +
  "transition-[background-color,box-shadow,transform] duration-150 " +
  "active:scale-[0.99] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-700 text-white shadow-sm shadow-brand-900/10 hover:bg-brand-800",
  secondary:
    "border border-black/10 bg-white text-brand-900 shadow-sm hover:bg-black/[0.02]",
  ghost: "text-brand-800 hover:bg-brand-50",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-6 text-base",
};

/**
 * Centralized button styling. Use on a <button> via the <Button> component, or
 * on a <Link> directly: `<Link className={buttonClasses({ variant: "primary" })}>`.
 */
export function buttonClasses(opts?: {
  variant?: Variant;
  size?: Size;
  className?: string;
}): string {
  return cn(
    base,
    variants[opts?.variant ?? "primary"],
    sizes[opts?.size ?? "md"],
    opts?.className,
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** The one button. Variants/sizes centralized so every CTA is identical. */
export default function Button({
  variant,
  size,
  className,
  ...props
}: ButtonProps) {
  return (
    <button className={buttonClasses({ variant, size, className })} {...props} />
  );
}
