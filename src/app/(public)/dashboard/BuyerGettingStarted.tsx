import Link from "next/link";
import {
  QrCode,
  CalendarClock,
  ShieldCheck,
  PackageCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Plain-language "how to shop" guide for an approved buyer. Open by default
 * until their first purchase, then collapses. Idiot-proof, step by step.
 */

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: QrCode,
    title: "1. Find what you want",
    body: 'Scan the seller\'s Datung QR with "Scan to pay" above, open the link they sent, or pick a seller in "Buy from a seller".',
  },
  {
    icon: CalendarClock,
    title: "2. Choose your plan",
    body: "Pick how many months to pay over. You'll see the exact amount per month before you confirm — no surprises.",
  },
  {
    icon: ShieldCheck,
    title: "3. Confirm — no cash now",
    body: "It uses your Datung spending limit, so you pay nothing today. Your payment is kept safe until you get your item.",
  },
  {
    icon: PackageCheck,
    title: "4. Get your item",
    body: "In person: show the seller the 6-digit code on your screen. Shipped to you: tap \"Confirm receipt\" once it arrives and looks good.",
  },
  {
    icon: Wallet,
    title: "5. Pay your installments",
    body: "Each month, pay via GCash or bank and submit your reference number in the Payments tab. Pay on time and your spending limit grows.",
  },
];

export default function BuyerGettingStarted({
  hasOrders,
}: {
  hasOrders: boolean;
}) {
  return (
    <details
      open={!hasOrders}
      className="group rounded-2xl border border-brand-100 bg-brand-50/40"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-5 py-4">
        <span className="font-semibold text-brand-800">
          How it works — start here
        </span>
        <span className="text-xs font-medium text-black/45 group-open:hidden">
          Tap to read
        </span>
      </summary>

      <div className="space-y-4 px-5 pb-5">
        <ol className="space-y-3">
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-sm">
                  <Icon className="size-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {s.title}
                  </p>
                  <p className="text-sm leading-relaxed text-black/60">{s.body}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="rounded-xl border border-black/[0.07] bg-white p-4 text-sm leading-relaxed text-black/60">
          When a payment is due, the{" "}
          <Link
            href="/dashboard/payments"
            className="font-medium text-brand-700 underline underline-offset-4"
          >
            Payments tab
          </Link>{" "}
          shows what to pay and how. Need help? Your profile has a contact-support
          option.
        </p>
      </div>
    </details>
  );
}
