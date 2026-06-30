-- =============================================================================
-- Location capture + consent, and a consent flag for imported contacts (0031)
--
-- Captures a borrower's / seller's device location as a fraud + verification
-- signal, ONLY with explicit, recorded consent and only at discrete events
-- (signup, seller onboarding, each checkout) — a foreground, consented snapshot
-- trail, NOT silent background tracking (the web platform can't do that anyway).
--
-- Consent is stored on the profile (a timestamped opt-in) and every capture is
-- an append-only row in location_events with its purpose. The contacts_consent
-- flag records that a buyer voluntarily imported references via the device's
-- own contact picker (the only contact access the web platform permits — the
-- user hand-picks each entry; there is no bulk phonebook read).
--
-- location_events is written/read only by the service role (no RLS policies),
-- the same posture as document_acceptances.
-- =============================================================================

-- ---- 1. Consent flags on the profiles ---------------------------------------
alter table public.buyer_profiles
  add column if not exists location_consent      boolean not null default false,
  add column if not exists location_consent_at   timestamptz,
  add column if not exists contacts_consent       boolean not null default false,
  add column if not exists contacts_consent_at     timestamptz;

alter table public.seller_profiles
  add column if not exists location_consent      boolean not null default false,
  add column if not exists location_consent_at   timestamptz;

-- ---- 2. Append-only location capture trail ----------------------------------
create table if not exists public.location_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  -- Set when the capture is tied to a specific purchase (the checkout trail).
  loan_id     uuid references public.loans(id) on delete set null,
  source      text not null,            -- 'signup' | 'seller_onboarding' | 'checkout' | 'manual'
  lat         numeric(9, 6) not null,
  lng         numeric(9, 6) not null,
  accuracy_m  numeric,                  -- reported GPS accuracy in metres, if any
  captured_at timestamptz not null default now()
);

create index if not exists location_events_user_idx
  on public.location_events (user_id, captured_at desc);
create index if not exists location_events_loan_idx
  on public.location_events (loan_id);

alter table public.location_events enable row level security;
-- No policies: only the service-role client (which bypasses RLS) may read/write.
