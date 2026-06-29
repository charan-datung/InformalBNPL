-- =============================================================================
-- Buyer credit graduation counter (migration 0025)
--
-- Tracks how many graduation milestones a buyer has already been granted, so the
-- limit-increase logic is idempotent: a milestone is the floor(on-time payments /
-- threshold), and we only bump the limit when the milestone advances past what's
-- already been counted. (Mirrors the seller-graduation idea on the buyer side.)
-- =============================================================================

alter table public.buyer_profiles
  add column if not exists graduation_count int not null default 0;
