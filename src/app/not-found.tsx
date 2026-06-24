import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";

/**
 * Root 404. Shown for any unmatched route; keeps the brand and offers a clear
 * way back instead of a bare "404".
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-5 px-4 text-center">
      <LogoMark className="h-12 w-auto opacity-80" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          The page you’re looking for doesn’t exist or has moved.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
      >
        Back to home
      </Link>
    </div>
  );
}
