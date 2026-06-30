import Link from "next/link";
import {
  QrCode,
  Send,
  ShieldCheck,
  PackageCheck,
  Banknote,
  Megaphone,
  Printer,
  type LucideIcon,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

/**
 * Plain-language "how selling works" guide for an approved seller. Open by
 * default until they've made their first sale, then collapses to stay handy
 * without nagging. Spells out advertising + the whole flow step by step.
 */

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: QrCode,
    title: "1. Make a sale",
    body: 'Tap "New sale" above. Type the price and what it\'s for — Datung makes a QR code and a link for that exact amount.',
  },
  {
    icon: Send,
    title: "2. Send it to your buyer",
    body: "Show them the QR to scan, or send the link on Messenger/SMS. New customer? Share your invite link or print a poster (below) so they can sign up first.",
  },
  {
    icon: ShieldCheck,
    title: "3. Buyer pays",
    body: "They pick how many months to pay and confirm. Their payment is kept safe by Datung — you'll get a \"You got paid\" notice.",
  },
  {
    icon: PackageCheck,
    title: "4. Hand over or ship",
    body: 'In person: give the item, then type the 6-digit code from the buyer\'s screen. Shipping: send it, then tap "Mark as shipped" and add a photo.',
  },
  {
    icon: Banknote,
    title: "5. Get paid",
    body: "Once the buyer receives it, Datung releases your money (minus the fee). Track everything under the Payouts tab.",
  },
];

export default function SellerGettingStarted({
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
          How selling works — start here
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

        <div className="rounded-xl border border-black/[0.07] bg-white p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Megaphone className="size-4 text-brand-600" /> How to find buyers
          </p>
          <p className="mt-1 text-sm leading-relaxed text-black/60">
            Post your QR code or poster on your Facebook page, your stall, and
            group chats. Every customer who signs up from your link is credited
            to you. Your ready-made messages and QR are in the{" "}
            <Link
              href="/dashboard/more"
              className="font-medium text-brand-700 underline underline-offset-4"
            >
              More tab
            </Link>
            .
          </p>
          <Link
            href="/dashboard/poster"
            target="_blank"
            className={buttonClasses({
              variant: "secondary",
              size: "sm",
              className: "mt-3",
            })}
          >
            <Printer className="size-4" /> Print a stall poster
          </Link>
        </div>
      </div>
    </details>
  );
}
