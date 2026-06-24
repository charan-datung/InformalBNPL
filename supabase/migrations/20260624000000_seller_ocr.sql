-- Seller-side OCR results (operator-triggered, Tesseract). Stored on the seller
-- profile so the operator sees extracted text from the government ID and the
-- storefront photo when verifying. Mirrors the buyer OCR (which lives in the
-- buyer application JSONB); seller_profiles has no JSONB, so use plain columns.
alter table public.seller_profiles
  add column if not exists ocr_id_text         text,
  add column if not exists ocr_storefront_text text;
