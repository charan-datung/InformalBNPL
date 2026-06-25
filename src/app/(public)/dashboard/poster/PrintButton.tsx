"use client";

import { Printer } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

/** Triggers the browser print dialog for the stall poster. Hidden in print. */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={buttonClasses({ variant: "primary" })}
    >
      <Printer className="size-4" />
      Print this poster
    </button>
  );
}
