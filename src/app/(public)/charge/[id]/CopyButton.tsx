"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

/** Copy the exclusive payment link to share via Messenger/SMS. */
export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <input
        readOnly
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        className={cn(controlClasses, "h-11 px-3 text-xs")}
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked; the field is selectable as a fallback */
          }
        }}
        className={buttonClasses({
          variant: copied ? "secondary" : "primary",
          size: "md",
          className: "shrink-0",
        })}
      >
        {copied ? (
          <>
            <Check className="size-4" /> Copied
          </>
        ) : (
          <>
            <Copy className="size-4" /> Copy
          </>
        )}
      </button>
    </div>
  );
}
