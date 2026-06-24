import { LogoMark } from "@/components/brand/Logo";

/**
 * Full-area loading state shown while a route segment streams in (via a
 * loading.tsx Suspense boundary) or anywhere we await server work. The brand
 * mark gently pulses with a spinner ring beneath it so a slow page never looks
 * frozen or blank. Centered within whatever container renders it.
 */
export default function LoadingScreen({
  label = "Loading…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-h-[40vh] flex-col items-center justify-center gap-4 py-16 ${className}`}
    >
      <LogoMark className="h-12 w-auto animate-pulse" />
      <span
        aria-hidden
        className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600/30 border-t-brand-600"
      />
      <span className="text-sm text-black/60 dark:text-white/60">{label}</span>
    </div>
  );
}
