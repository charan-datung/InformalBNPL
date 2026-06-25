"use client";

import { useState } from "react";
import {
  Banknote,
  Check,
  Copy,
  Download,
  QrCode,
  Wallet,
  X,
} from "lucide-react";
import Image from "next/image";
import { formatPeso } from "@/lib/format";
import { REPAYMENT_DETAILS } from "@/lib/payments/repayment-details";
import { buttonClasses } from "@/components/ui/Button";

/**
 * "How to pay" for a buyer repayment. A button opens a sheet showing the exact
 * amount due and two ways to pay it: a bank transfer (with copy-to-clipboard)
 * and a GCash/e-wallet QR the buyer downloads and uploads in their app. The
 * platform records the payment manually once received — nothing is charged here.
 */
export default function PayInstructions({
  amountCentavos,
  label = "How to pay",
  variant = "primary",
  className,
}: {
  amountCentavos: number;
  label?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClasses({ variant, size: "sm", className })}
      >
        <Wallet className="size-3.5" /> {label}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="How to pay"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">Pay your installment</h2>
                <p className="text-xs text-black/55">
                  Send the exact amount, then we&apos;ll mark it paid.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-xl text-black/40 hover:bg-black/[0.04] hover:text-black/70"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Amount due */}
            <div className="mt-4 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-4 text-white">
              <div className="text-[11px] font-medium uppercase tracking-wide text-white/60">
                Amount to pay
              </div>
              <div className="text-3xl font-bold tabular-nums">
                {formatPeso(amountCentavos)}
              </div>
            </div>

            {/* Method 1 — GCash / e-wallet QR */}
            <section className="mt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <QrCode className="size-4 text-brand-600" /> Pay with GCash or
                e-wallet
              </h3>
              <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-black/[0.07] bg-black/[0.015] p-4">
                <Image
                  src={REPAYMENT_DETAILS.qrImageSrc}
                  alt="Datung GCash payment QR"
                  width={180}
                  height={180}
                  className="size-44 rounded-lg bg-white object-contain p-2 shadow-sm"
                  unoptimized
                />
                <a
                  href={REPAYMENT_DETAILS.qrImageSrc}
                  download="datung-gcash-qr.png"
                  className={buttonClasses({
                    variant: "secondary",
                    size: "sm",
                    className: "w-full",
                  })}
                >
                  <Download className="size-3.5" /> Download QR
                </a>
              </div>
              <ol className="mt-3 space-y-1.5">
                {REPAYMENT_DETAILS.qrSteps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-black/70">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </section>

            {/* Method 2 — Bank transfer */}
            <section className="mt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Banknote className="size-4 text-brand-600" /> Or bank transfer
              </h3>
              <div className="mt-3 divide-y divide-black/5 rounded-xl border border-black/[0.07]">
                <CopyRow label="Bank" value={REPAYMENT_DETAILS.bank.name} />
                <CopyRow
                  label="Account name"
                  value={REPAYMENT_DETAILS.bank.accountName}
                />
                <CopyRow
                  label="Account number"
                  value={REPAYMENT_DETAILS.bank.accountNumber}
                  mono
                />
              </div>
            </section>

            <p className="mt-4 text-center text-[11px] text-black/45">
              After paying, your operator records it and your plan updates. Keep
              your receipt just in case.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CopyRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently no-op.
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-black/45">
          {label}
        </div>
        <div className={`truncate text-sm font-medium ${mono ? "tabular-nums" : ""}`}>
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
      >
        {copied ? (
          <>
            <Check className="size-3.5" /> Copied
          </>
        ) : (
          <>
            <Copy className="size-3.5" /> Copy
          </>
        )}
      </button>
    </div>
  );
}
