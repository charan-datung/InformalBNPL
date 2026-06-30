"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

/**
 * One-tap share. Uses the native share sheet (Web Share API) on mobile — the
 * idiot-proof way to send an invite to Messenger/SMS/anywhere — and falls back
 * to copying the message+link to the clipboard on desktop.
 */
export default function ShareButton({
  url,
  message,
  title = "Datung",
  label = "Share with buyers",
}: {
  url: string;
  message: string;
  title?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const full = `${message} ${url}`.trim();

  async function onShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: message, url });
      } catch {
        /* user dismissed the share sheet — nothing to do */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the messages below are still selectable */
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className={buttonClasses({ size: "lg", className: "w-full" })}
    >
      {copied ? (
        <>
          <Check className="size-4" /> Copied — paste it anywhere
        </>
      ) : (
        <>
          <Share2 className="size-4" /> {label}
        </>
      )}
    </button>
  );
}
