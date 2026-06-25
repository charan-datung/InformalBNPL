"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  MessageCircle,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Ready-to-send recruitment copy for a seller to forward to their own buyers.
 * Three channels, each in a card with a one-tap copy that grabs the full
 * message (link included). Taglish, Filipino micro-merchant tone.
 */
export default function ShareMessages({
  inviteUrl,
  sellerName,
}: {
  inviteUrl: string;
  sellerName?: string;
}) {
  const who = sellerName?.trim() ? sellerName.trim() : null;
  const withMe = who ? ` with ${who}` : " with me";

  const messages: { channel: string; label: string; Icon: LucideIcon; text: string }[] = [
    {
      channel: "messenger",
      label: "Messenger / Facebook",
      Icon: MessageCircle,
      text: `Hi! Good news — pwede ka nang mag-shop now, pay later${withMe} on Datung! 🛍️ No credit card needed, libre mag-sign up. Approved buyers get a credit limit na pwede mong gamitin agad. Sign up here: ${inviteUrl}`,
    },
    {
      channel: "sms",
      label: "SMS",
      Icon: Smartphone,
      text: `Shop now, pay later${withMe} on Datung! No credit card needed. Sign up: ${inviteUrl}`,
    },
    {
      channel: "story",
      label: "Story caption",
      Icon: Sparkles,
      text: `Buy now, pay later na tayo${who ? `${withMe}` : ""}! 🛍️✨ No credit card, libreng sign-up. Tap the link & get approved 👉 ${inviteUrl} #ShopNowPayLater #Datung #BNPL`,
    },
  ];

  return (
    <div className="space-y-2.5">
      {messages.map((m) => (
        <MessageCard key={m.channel} label={m.label} Icon={m.Icon} text={m.text} />
      ))}
    </div>
  );
}

function MessageCard({
  label,
  Icon,
  text,
}: {
  label: string;
  Icon: LucideIcon;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-brand-800">
          <Icon className="size-4 text-brand-600" />
          {label}
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked; text is still selectable */
            }
          }}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
            copied
              ? "border-accent-200 bg-accent-50/70 text-accent-700"
              : "border-black/10 bg-white text-brand-800 hover:bg-black/[0.02]",
          )}
        >
          {copied ? (
            <>
              <Check className="size-3.5" /> Copied!
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Copy
            </>
          )}
        </button>
      </div>
      <p className="text-sm text-black/70">{text}</p>
    </div>
  );
}
