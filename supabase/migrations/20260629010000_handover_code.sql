-- =============================================================================
-- In-person handover code (migration 0021)
--
-- Anti-fraud for in-person sales: instead of silently auto-advancing to
-- "handed over" with no proof, the buyer is shown a 6-digit code at checkout and
-- the seller must enter it to confirm the handover. Stored on the loan; set at
-- authorization for in-person charges, cleared/stamped when confirmed.
-- =============================================================================

alter table public.loans
  add column if not exists handover_code text;
alter table public.loans
  add column if not exists handover_confirmed_at timestamptz;
