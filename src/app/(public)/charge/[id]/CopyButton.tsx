"use client";

import { useState } from "react";

/** Copy the exclusive payment link to share via Messenger/SMS. */
export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <input
        readOnly
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-md border border-black/15 px-3 py-2 text-xs dark:border-white/15 dark:bg-transparent"
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
        className="shrink-0 rounded-md bg-brand-700 px-3 py-2 text-xs font-medium text-white hover:bg-brand-600"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
