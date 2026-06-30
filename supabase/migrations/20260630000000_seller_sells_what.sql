-- =============================================================================
-- Seller "what do you sell" description (0030)
--
-- Sellers had no plain-text field for the goods they offer: the only free-text
-- signal was the OPTIONAL social/marketplace handle, which the operator console
-- surfaced as "Sells as". Merchants misread that label and filled it with their
-- home address. This adds a dedicated, required-at-onboarding field so the
-- operator (and, later, buyers) can see what a seller actually sells.
-- =============================================================================

alter table public.seller_profiles
  add column if not exists sells_what text;
