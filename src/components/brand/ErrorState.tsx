"use client";

import Link from "next/link";
import { useEffect } from "react";
import { LogoMark } from "@/components/brand/Logo";

/**
 * Shared recoverable error UI for route-group error.tsx boundaries. Keeps the
 * surrounding layout (header/nav) intact, logs the error for observability, and
 * offers a retry plus an escape hatch home — so a thrown server error shows a
 * calm, branded screen instead of a raw crash in production.
 */
export default function ErrorState({
  error,
  reset,
  homeHref = "/",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
}) {
  useEffect(() => {
    console.error("Route error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 py-16 text-center">
      <LogoMark className="h-12 w-auto opacity-80" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-black/60 dark:text-white/60">
          We hit an unexpected error. You can try again, or head back and retry
          what you were doing.
        </p>
        {error.digest ? (
          <p className="pt-1 text-[11px] text-black/40 dark:text-white/40">
            Reference: {error.digest}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Try again
        </button>
        <Link
          href={homeHref}
          className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.04]"
        >
          Go back
        </Link>
      </div>
    </div>
  );
}
