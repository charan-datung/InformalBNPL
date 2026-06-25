# Buyer repayment QR

`repayment-qr.png` is the GCash / e-wallet QR code buyers see on the
dashboard under **How to pay** (and can download to upload in GCash).

## How to replace it with the real QR

1. Get the real Datung payment QR image (a PNG or JPG screenshot is fine).
2. Rename it to **`repayment-qr.png`**.
3. Drop it in this folder (`public/pay/`), replacing the placeholder.
4. Commit and deploy. No code change is needed.

The file currently here is a **placeholder** — scanning it just shows a
"replace me" note. The bank-transfer details shown alongside the QR live in
`src/lib/payments/repayment-details.ts`.
