-- =============================================================================
-- Seller referral rewards (0017)
--
-- An approved seller can refer OTHER sellers via a tagged sign-up link
-- (/signup?intent=seller&sref=<referrer>). When the referred person applies as
-- a seller we record a `pending` referral; when their FIRST order COMPLETES
-- (escrow is released to them) it becomes `qualified` and a fixed cash bounty
-- (system_config.seller_referral_reward_centavos) is owed to the referrer. The
-- operator settles the bounty off-platform and marks it `paid` — consistent with
-- the platform recording state only and never moving money.
--
-- All access is server-side via the service role; deny everyone else.
-- =============================================================================

create table if not exists public.seller_referrals (
  id                uuid primary key default gen_random_uuid(),
  -- The approved seller who referred (owed the bounty).
  referrer_user_id  uuid not null references public.users (id),
  -- The newly referred seller. One referral per referred person.
  referred_user_id  uuid not null unique references public.users (id),
  status            text not null default 'pending'
                      check (status in ('pending', 'qualified', 'paid', 'void')),
  -- Snapshotted from system_config at qualification time, so later config
  -- changes don't retroactively alter what's owed.
  reward_centavos   integer,
  qualified_at      timestamptz,
  paid_at           timestamptz,
  created_at        timestamptz not null default now()
);

-- A seller can't refer themselves.
alter table public.seller_referrals
  add constraint seller_referrals_no_self
  check (referrer_user_id <> referred_user_id);

create index if not exists seller_referrals_referrer_idx
  on public.seller_referrals (referrer_user_id, created_at desc);
create index if not exists seller_referrals_status_idx
  on public.seller_referrals (status);

alter table public.seller_referrals enable row level security;
