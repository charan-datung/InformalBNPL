"use client";

import { Printer } from "lucide-react";

/**
 * Triggers the browser print dialog so a borrower can print or "Save as PDF".
 * Hidden when the page itself is printed (the parent marks it `print:hidden`).
 */
export default function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm font-medium hover:bg-black/[0.03]"
    >
      <Printer className="size-4" /> {label}
    </button>
  );
}
