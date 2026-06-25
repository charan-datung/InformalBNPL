/**
 * Where buyers send their repayments. The platform records the money manually
 * once received, so this is purely the "how to pay" information shown to the
 * buyer — a bank account for transfers and a GCash/e-wallet QR.
 *
 * To update the QR: replace the image file at `public/pay/repayment-qr.png`
 * with the real GCash/Maya payment QR (any square image works). No code change
 * is needed. See public/pay/README.md.
 */
export const REPAYMENT_DETAILS = {
  bank: {
    name: "Asia United Bank",
    accountName: "Dark Knight Lending Inc",
    accountNumber: "097010001403",
  },
  /** Public path to the GCash/e-wallet QR image buyers download and scan. */
  qrImageSrc: "/pay/repayment-qr.png",
  /** Step-by-step for paying the QR from GCash. */
  qrSteps: [
    "Open your GCash app and tap “QR”.",
    "Tap “Upload QR” (bottom of the scanner).",
    "Choose the Datung QR you just downloaded.",
    "Enter the exact amount shown above and send.",
  ],
} as const;
