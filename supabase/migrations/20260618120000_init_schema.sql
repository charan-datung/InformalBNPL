-- =============================================================================
-- Informal BNPL pilot — initial schema (migration 0001)
--
-- Hard rules baked into this schema:
--   * The app records loan/escrow STATE only. No real money moves here.
--   * Money is PHP, stored as INTEGER CENTAVOS in BIGINT columns. Never floats.
--   * escrow_events is an append-only audit log (enforced by trigger).
--
-- Architecture note on writes vs reads:
--   * RLS below governs READS from the public/operator/admin surfaces.
--   * MUTATIONS (status changes, new events, etc.) run server-side via the
--     Supabase service role, which bypasses RLS. The loan state-machine
--     validator in src/lib/loans/state-machine.ts is the source of truth for
--     which status transitions are allowed.
-- =============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid(), crypt() for seed

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- null staff_role on a user = normal (non-staff) user. The enum only names the
-- two privileged roles.
create type staff_role as enum ('operator', 'admin');

create type kyc_status as enum ('pending', 'verified', 'rejected');
create type trust_tier as enum ('new', 'trusted');

-- The full loan lifecycle. Transition rules are enforced in the app layer
-- (src/lib/loans/state-machine.ts); this enum only constrains valid values.
create type loan_status as enum (
  'booked',
  'escrow_held',
  'shipped',
  'delivered_confirmed',
  'dispute_raised',
  'auto_released',
  'escrow_released',
  'repaying',
  'settled',              -- terminal (happy path)
  'refunded',             -- terminal (side state)
  'frozen_fraud_review'   -- side state (hold)
);

-- Every meaningful thing that happens to a loan is recorded as an escrow_event.
create type escrow_event_type as enum (
  'booked',
  'escrow_held',
  'shipped',
  'delivered_confirmed',
  'dispute_raised',
  'auto_released',
  'dispute_resolved',
  'escrow_released',
  'repayment_recorded',
  'settled',
  'refunded',
  'frozen_fraud_review',
  'unfrozen',
  'note'                  -- free-text operator note, no state change
);

create type repayment_status as enum ('pending', 'paid', 'late', 'waived');
create type dispute_status as enum ('open', 'under_review', 'resolved', 'rejected');

-- -----------------------------------------------------------------------------
-- Identity: one account, independently-unlockable capabilities
-- -----------------------------------------------------------------------------

-- One row per identity, mirrored 1:1 from auth.users (see handle_new_user
-- trigger). staff_role NULL = normal user. A normal user becomes a buyer
-- and/or seller by gaining the matching profile row below.
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  contact     text,
  staff_role  staff_role,            -- null = normal user; else operator/admin
  created_at  timestamptz not null default now()
);

-- Buyer capability. A user has AT MOST ONE buyer_profile (user_id is PK/unique).
-- Absence of a row = the user cannot buy.
create table public.buyer_profiles (
  user_id               uuid primary key references public.users (id) on delete cascade,
  kyc_status            kyc_status not null default 'pending',
  credit_limit_centavos bigint not null default 0 check (credit_limit_centavos >= 0),
  underwriting_notes    text,
  activated_at          timestamptz,          -- set when buyer is allowed to transact
  created_at            timestamptz not null default now()
);

-- Seller capability. A user has AT MOST ONE seller_profile (user_id is PK/unique).
-- Independent of buyer_profiles — a user may have either, both, or neither.
create table public.seller_profiles (
  user_id             uuid primary key references public.users (id) on delete cascade,
  social_handle       text,
  kyc_status          kyc_status not null default 'pending',
  trust_tier          trust_tier not null default 'new',
  rolling_reserve_pct numeric(5,2) not null default 0
                        check (rolling_reserve_pct >= 0 and rolling_reserve_pct <= 100),
  verification_notes  text,
  activated_at        timestamptz,
  created_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Transactions
-- -----------------------------------------------------------------------------

-- One BNPL transaction between a buyer and a seller. `status` is the live state
-- machine position; history lives in escrow_events.
create table public.loans (
  id                    uuid primary key default gen_random_uuid(),
  buyer_user_id         uuid not null references public.users (id),
  seller_user_id        uuid not null references public.users (id),
  ticket_centavos       bigint not null check (ticket_centavos > 0),
  tenor_months          int not null check (tenor_months > 0),
  interest_rate_monthly numeric(6,4) not null check (interest_rate_monthly >= 0), -- e.g. 0.0350 = 3.5%/mo
  merchant_fee_pct      numeric(5,2) not null check (merchant_fee_pct >= 0),      -- e.g. 5.00 = 5%
  status                loan_status not null default 'booked',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint buyer_is_not_seller check (buyer_user_id <> seller_user_id)
);

-- Append-only audit log for everything that happens to a loan (state changes,
-- money-movement records, notes). NEVER updated or deleted — enforced by the
-- prevent_mutation trigger. amount_centavos is null for non-monetary events;
-- actor_user_id is null for system/automatic events (e.g. auto_released).
create table public.escrow_events (
  id              uuid primary key default gen_random_uuid(),
  loan_id         uuid not null references public.loans (id) on delete restrict,
  event_type      escrow_event_type not null,
  amount_centavos bigint check (amount_centavos is null or amount_centavos >= 0),
  note            text,
  actor_user_id   uuid references public.users (id),  -- null = system/automatic
  created_at      timestamptz not null default now()
);

-- The buyer's repayment schedule for a loan. One row per installment.
create table public.repayments (
  id              uuid primary key default gen_random_uuid(),
  loan_id         uuid not null references public.loans (id) on delete restrict,
  amount_centavos bigint not null check (amount_centavos >= 0),
  due_date        date not null,
  paid_at         timestamptz,                 -- null until recorded paid
  status          repayment_status not null default 'pending',
  created_at      timestamptz not null default now()
);

-- A dispute raised against a loan. resolution / resolved_by / resolved_at are
-- filled in when an operator or admin closes it out.
create table public.disputes (
  id                  uuid primary key default gen_random_uuid(),
  loan_id             uuid not null references public.loans (id) on delete restrict,
  raised_by_user_id   uuid not null references public.users (id),
  reason              text not null,
  evidence_url        text,
  status              dispute_status not null default 'open',
  resolution          text,
  resolved_by_user_id uuid references public.users (id),
  resolved_at         timestamptz,
  created_at          timestamptz not null default now()
);

-- Admin-editable system parameters. value is jsonb so a single table holds
-- numbers, strings, and booleans. Defaults live in code
-- (src/lib/config/system-config.ts); rows here OVERRIDE those defaults.
create table public.system_config (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.users (id),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Indexes (foreign keys used in lookups / RLS subqueries)
-- -----------------------------------------------------------------------------
create index loans_buyer_idx        on public.loans (buyer_user_id);
create index loans_seller_idx       on public.loans (seller_user_id);
create index loans_status_idx       on public.loans (status);
create index escrow_events_loan_idx on public.escrow_events (loan_id);
create index repayments_loan_idx    on public.repayments (loan_id);
create index disputes_loan_idx      on public.disputes (loan_id);

-- -----------------------------------------------------------------------------
-- Triggers / functions
-- -----------------------------------------------------------------------------

-- Mirror every new auth user into public.users. name/contact come from the
-- sign-up metadata; staff_role stays null (granted later by an admin).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, name, contact)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'contact', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep loans.updated_at fresh on every update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger loans_set_updated_at
  before update on public.loans
  for each row execute function public.set_updated_at();

-- Enforce append-only on escrow_events (no updates, no deletes — ever).
create or replace function public.prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'escrow_events is append-only; % is not permitted', tg_op;
end;
$$;

create trigger escrow_events_append_only
  before update or delete on public.escrow_events
  for each row execute function public.prevent_mutation();

-- -----------------------------------------------------------------------------
-- Role helpers (used by RLS policies). SECURITY DEFINER so policies can read
-- staff_role without the caller needing direct access to public.users.
-- -----------------------------------------------------------------------------
create or replace function public.current_staff_role()
returns staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select staff_role from public.users where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_staff_role() is not null;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_staff_role() = 'admin';
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- Model: logged-in clients get READ access scoped to their own data; staff
-- (operator/admin) read everything. No INSERT/UPDATE/DELETE policies are
-- granted to clients — all writes go through trusted server-side code using
-- the service role, which bypasses RLS.
-- -----------------------------------------------------------------------------
alter table public.users           enable row level security;
alter table public.buyer_profiles  enable row level security;
alter table public.seller_profiles enable row level security;
alter table public.loans           enable row level security;
alter table public.escrow_events   enable row level security;
alter table public.repayments      enable row level security;
alter table public.disputes        enable row level security;
alter table public.system_config   enable row level security;

-- users: see your own row; staff see all.
create policy users_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

-- profiles: see your own; staff see all.
create policy buyer_profiles_select on public.buyer_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy seller_profiles_select on public.seller_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- loans: see loans you are a party to (as buyer or seller); staff see all.
create policy loans_select on public.loans
  for select to authenticated
  using (
    buyer_user_id = auth.uid()
    or seller_user_id = auth.uid()
    or public.is_staff()
  );

-- escrow_events / repayments / disputes: visible to the parties of the parent
-- loan; staff see all.
create policy escrow_events_select on public.escrow_events
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.loans l
      where l.id = loan_id
        and (l.buyer_user_id = auth.uid() or l.seller_user_id = auth.uid())
    )
  );

create policy repayments_select on public.repayments
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.loans l
      where l.id = loan_id
        and (l.buyer_user_id = auth.uid() or l.seller_user_id = auth.uid())
    )
  );

create policy disputes_select on public.disputes
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.loans l
      where l.id = loan_id
        and (l.buyer_user_id = auth.uid() or l.seller_user_id = auth.uid())
    )
  );

-- system_config: staff only (the app reads it server-side via service role).
create policy system_config_select on public.system_config
  for select to authenticated
  using (public.is_staff());

-- -----------------------------------------------------------------------------
-- Grants. RLS gates rows; these grant the base read privilege to logged-in
-- clients. anon (logged-out) gets nothing. service_role bypasses all of this.
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select on
  public.users, public.buyer_profiles, public.seller_profiles,
  public.loans, public.escrow_events, public.repayments,
  public.disputes, public.system_config
to authenticated;
