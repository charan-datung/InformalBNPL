-- ============================================================
-- Informal BNPL / Datung — full database setup (schema only).
-- Paste this whole file into the Supabase SQL Editor and Run.
-- Production: do NOT run seed.sql (test accounts). See DEPLOY.md.
-- ============================================================

-- >>>>> 20260618120000_init_schema.sql >>>>>
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


-- >>>>> 20260618130000_loan_mutations.sql >>>>>
-- =============================================================================
-- Informal BNPL pilot — loan mutation RPCs (migration 0002)
--
-- These are the ONLY way the app changes loan state. Each does its work in a
-- single transaction so a status change and its escrow_events audit row are
-- always written together (or not at all).
--
-- Division of responsibility:
--   * The TypeScript state-machine validator (src/lib/loans/state-machine.ts)
--     decides WHICH transitions are legal and calls these with the current
--     status as p_from.
--   * apply_loan_transition only does an atomic compare-and-swap on p_from,
--     which also guards against a concurrent change between read and write.
--
-- Called server-side via the service role only (see grants at the bottom).
-- =============================================================================

-- Create a loan and its initial 'booked' audit event atomically.
create or replace function public.book_loan(
  p_buyer                 uuid,
  p_seller                uuid,
  p_ticket_centavos       bigint,
  p_tenor_months          int,
  p_interest_rate_monthly numeric,
  p_merchant_fee_pct      numeric,
  p_actor                 uuid default null,
  p_note                  text default null
)
returns public.loans
language plpgsql
as $$
declare
  v_loan public.loans;
begin
  insert into public.loans (
    buyer_user_id, seller_user_id, ticket_centavos, tenor_months,
    interest_rate_monthly, merchant_fee_pct, status
  )
  values (
    p_buyer, p_seller, p_ticket_centavos, p_tenor_months,
    p_interest_rate_monthly, p_merchant_fee_pct, 'booked'
  )
  returning * into v_loan;

  insert into public.escrow_events
    (loan_id, event_type, amount_centavos, note, actor_user_id)
  values
    (v_loan.id, 'booked', p_ticket_centavos, coalesce(p_note, 'Loan booked'), p_actor);

  return v_loan;
end;
$$;

-- Move a loan from p_from to p_to and append an audit event, atomically.
-- The `status = p_from` guard makes this a compare-and-swap: if the loan is no
-- longer in the expected state (someone else moved it), nothing is written and
-- the function raises.
create or replace function public.apply_loan_transition(
  p_loan_id    uuid,
  p_from       loan_status,
  p_to         loan_status,
  p_event_type escrow_event_type,
  p_amount     bigint default null,
  p_note       text default null,
  p_actor      uuid default null
)
returns public.loans
language plpgsql
as $$
declare
  v_loan public.loans;
begin
  update public.loans
     set status = p_to
   where id = p_loan_id
     and status = p_from
  returning * into v_loan;

  if not found then
    raise exception
      'loan % is not in expected state % (concurrent change or wrong from-state)',
      p_loan_id, p_from
      using errcode = 'check_violation';
  end if;

  insert into public.escrow_events
    (loan_id, event_type, amount_centavos, note, actor_user_id)
  values
    (p_loan_id, p_event_type, p_amount, p_note, p_actor);

  return v_loan;
end;
$$;

-- Lock these down: only the service role (server-side) may call them. anon /
-- authenticated must not reach them through the PostgREST RPC surface.
revoke execute on function
  public.book_loan(uuid, uuid, bigint, int, numeric, numeric, uuid, text)
  from public;
revoke execute on function
  public.apply_loan_transition(uuid, loan_status, loan_status, escrow_event_type, bigint, text, uuid)
  from public;

grant execute on function
  public.book_loan(uuid, uuid, bigint, int, numeric, numeric, uuid, text)
  to service_role;
grant execute on function
  public.apply_loan_transition(uuid, loan_status, loan_status, escrow_event_type, bigint, text, uuid)
  to service_role;


-- >>>>> 20260618140000_seller_verification_storage.sql >>>>>
-- =============================================================================
-- Informal BNPL pilot — seller verification photo (migration 0003)
--
-- Sellers must upload a live item photo during verification. We store the
-- object PATH on the seller profile; the file itself lives in a private
-- Storage bucket. Uploads/reads go through the service role (operators review
-- the photo server-side), so the bucket stays private with no public policies.
-- =============================================================================

alter table public.seller_profiles
  add column if not exists verification_photo_path text;

-- Create the private bucket only when running against Supabase (the `storage`
-- schema exists there). This block is a no-op on a plain Postgres instance.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('seller-verification', 'seller-verification', false)
    on conflict (id) do nothing;
  end if;
end $$;


-- >>>>> 20260618150000_release_escrow.sql >>>>>
-- =============================================================================
-- Informal BNPL pilot — escrow release with merchant fee (migration 0004)
--
-- When escrow is released, the operator owes the seller the ticket minus the
-- per-loan merchant fee. We record BOTH the gross release and the fee deduction
-- as separate append-only escrow_events rows, in one transaction, and return
-- the net so the console can show what to actually pay the seller.
--
-- The merchant fee percentage is the per-loan value captured at booking (which
-- itself came from system_config). Nothing is hardcoded here.
-- =============================================================================

-- New audit event type for the fee line. (ADD VALUE is safe in a migration; the
-- value is only referenced at runtime, not at function-create time.)
alter type escrow_event_type add value if not exists 'merchant_fee_deducted';

create or replace function public.release_escrow(
  p_loan_id uuid,
  p_from    loan_status,
  p_actor   uuid default null,
  p_note    text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_loan public.loans;
  v_fee  bigint;
  v_net  bigint;
begin
  -- Compare-and-swap to escrow_released (race-safe, same pattern as
  -- apply_loan_transition). The TS validator has already confirmed the
  -- current -> escrow_released transition is legal.
  update public.loans
     set status = 'escrow_released'
   where id = p_loan_id
     and status = p_from
  returning * into v_loan;

  if not found then
    raise exception
      'loan % is not in expected state % (concurrent change or wrong from-state)',
      p_loan_id, p_from
      using errcode = 'check_violation';
  end if;

  -- Gross release (full ticket held in escrow).
  insert into public.escrow_events (loan_id, event_type, amount_centavos, note, actor_user_id)
  values (p_loan_id, 'escrow_released', v_loan.ticket_centavos,
          coalesce(p_note, 'Escrow released (gross ticket)'), p_actor);

  -- Merchant fee deduction. Integer centavos throughout.
  v_fee := round(v_loan.ticket_centavos * v_loan.merchant_fee_pct / 100.0)::bigint;
  v_net := v_loan.ticket_centavos - v_fee;

  insert into public.escrow_events (loan_id, event_type, amount_centavos, note, actor_user_id)
  values (p_loan_id, 'merchant_fee_deducted', v_fee,
          format('Merchant fee %s%% withheld (%s centavos); net to seller %s centavos',
                 v_loan.merchant_fee_pct, v_fee, v_net),
          p_actor);

  return jsonb_build_object(
    'loan_id', p_loan_id,
    'gross_centavos', v_loan.ticket_centavos,
    'fee_centavos', v_fee,
    'net_centavos', v_net,
    'merchant_fee_pct', v_loan.merchant_fee_pct
  );
end;
$$;

revoke execute on function
  public.release_escrow(uuid, loan_status, uuid, text) from public;
grant execute on function
  public.release_escrow(uuid, loan_status, uuid, text) to service_role;


-- >>>>> 20260618160000_audit_log.sql >>>>>
-- =============================================================================
-- Informal BNPL pilot — unified staff audit log (migration 0005)
--
-- escrow_events captures the loan lifecycle. audit_log captures the OTHER staff
-- actions that aren't loan-scoped — profile approvals/rejections, config
-- changes, dispute decisions — in one append-only place. Never updated/deleted
-- (reuses the prevent_mutation trigger from migration 0001).
-- =============================================================================

create table public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users (id),     -- null = system
  action        text not null,                         -- e.g. 'buyer_approved'
  entity_type   text not null,                         -- 'buyer_profile' | 'seller_profile' | 'system_config' | 'dispute'
  entity_id     text,                                  -- the affected row's id / config key
  detail        jsonb,                                 -- arbitrary context (from/to values, notes)
  created_at    timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.prevent_mutation();

-- Staff read all; writes happen server-side via the service role.
alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.is_staff());

grant select on public.audit_log to authenticated;


-- >>>>> 20260618170000_buyer_dispute.sql >>>>>
-- =============================================================================
-- Informal BNPL pilot — buyer dispute flow (migration 0006)
--
-- Buyers raise disputes from their dashboard. raise_dispute atomically:
--   1. compare-and-swaps the loan shipped -> dispute_raised,
--   2. inserts the dispute row, and
--   3. appends a dispute_raised escrow_events audit row.
-- The TS validator confirms the transition is legal before calling this.
--
-- Dispute evidence photos go to a private bucket (operators view server-side).
-- =============================================================================

create or replace function public.raise_dispute(
  p_loan_id  uuid,
  p_from     loan_status,
  p_buyer    uuid,
  p_reason   text,
  p_evidence text default null
)
returns uuid
language plpgsql
as $$
declare
  v_dispute_id uuid;
begin
  update public.loans
     set status = 'dispute_raised'
   where id = p_loan_id
     and status = p_from
  returning id into v_dispute_id;  -- presence check only

  if not found then
    raise exception
      'loan % is not in expected state % (concurrent change or wrong from-state)',
      p_loan_id, p_from
      using errcode = 'check_violation';
  end if;

  insert into public.disputes (loan_id, raised_by_user_id, reason, evidence_url, status)
  values (p_loan_id, p_buyer, p_reason, p_evidence, 'open')
  returning id into v_dispute_id;

  insert into public.escrow_events (loan_id, event_type, note, actor_user_id)
  values (p_loan_id, 'dispute_raised', 'Buyer raised dispute', p_buyer);

  return v_dispute_id;
end;
$$;

revoke execute on function
  public.raise_dispute(uuid, loan_status, uuid, text, text) from public;
grant execute on function
  public.raise_dispute(uuid, loan_status, uuid, text, text) to service_role;

-- Private bucket for dispute evidence (no-op on plain Postgres).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('dispute-evidence', 'dispute-evidence', false)
    on conflict (id) do nothing;
  end if;
end $$;


-- >>>>> 20260618180000_repayments.sql >>>>>
-- =============================================================================
-- Informal BNPL pilot — repayment schedule + recording (migration 0007)
--
-- start_repayment: on escrow_released -> repaying, generate the installment
--   schedule (once) from the loan's stored values. Flat monthly interest on
--   principal: monthly_interest = round(ticket * interest_rate_monthly);
--   total = ticket + monthly_interest * tenor; split into `tenor` equal
--   installments with the last one absorbing the rounding remainder.
--
-- record_repayment: mark one installment paid, append a repayment_recorded
--   audit row, and auto-settle the loan (repaying -> settled) once nothing is
--   outstanding.
--
-- Both are atomic and service-role only. Money is integer centavos throughout.
-- =============================================================================

create or replace function public.start_repayment(
  p_loan_id uuid,
  p_from    loan_status,
  p_actor   uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_loan             public.loans;
  v_monthly_interest bigint;
  v_total            bigint;
  v_base             bigint;
  v_amount           bigint;
  i                  int;
begin
  update public.loans
     set status = 'repaying'
   where id = p_loan_id
     and status = p_from
  returning * into v_loan;

  if not found then
    raise exception
      'loan % is not in expected state % (concurrent change or wrong from-state)',
      p_loan_id, p_from
      using errcode = 'check_violation';
  end if;

  -- Generate the schedule only once.
  if exists (select 1 from public.repayments where loan_id = p_loan_id) then
    return jsonb_build_object('loan_id', p_loan_id, 'installments', 0,
                              'note', 'schedule already existed');
  end if;

  v_monthly_interest := round(v_loan.ticket_centavos * v_loan.interest_rate_monthly)::bigint;
  v_total := v_loan.ticket_centavos + v_monthly_interest * v_loan.tenor_months;
  v_base := v_total / v_loan.tenor_months;  -- integer (floor) division

  for i in 1 .. v_loan.tenor_months loop
    if i < v_loan.tenor_months then
      v_amount := v_base;
    else
      v_amount := v_total - v_base * (v_loan.tenor_months - 1);  -- remainder on last
    end if;

    insert into public.repayments (loan_id, amount_centavos, due_date, status)
    values (p_loan_id, v_amount,
            (current_date + (i || ' month')::interval)::date, 'pending');
  end loop;

  insert into public.escrow_events (loan_id, event_type, amount_centavos, note, actor_user_id)
  values (p_loan_id, 'note', v_total,
          format('Repayment schedule created: %s installments, total %s centavos (incl. interest)',
                 v_loan.tenor_months, v_total),
          p_actor);

  return jsonb_build_object(
    'loan_id', p_loan_id,
    'installments', v_loan.tenor_months,
    'total_centavos', v_total,
    'monthly_interest_centavos', v_monthly_interest
  );
end;
$$;

create or replace function public.record_repayment(
  p_repayment_id uuid,
  p_actor        uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_loan_id   uuid;
  v_amount    bigint;
  v_remaining int;
begin
  update public.repayments
     set status = 'paid', paid_at = now()
   where id = p_repayment_id
     and status <> 'paid'
  returning loan_id, amount_centavos into v_loan_id, v_amount;

  if not found then
    raise exception 'repayment % not found or already paid', p_repayment_id
      using errcode = 'check_violation';
  end if;

  insert into public.escrow_events (loan_id, event_type, amount_centavos, note, actor_user_id)
  values (v_loan_id, 'repayment_recorded', v_amount, 'Repayment recorded', p_actor);

  select count(*) into v_remaining
    from public.repayments
   where loan_id = v_loan_id and status not in ('paid', 'waived');

  -- Auto-settle once nothing is outstanding (system transition repaying -> settled).
  if v_remaining = 0 then
    update public.loans set status = 'settled'
     where id = v_loan_id and status = 'repaying';
    if found then
      insert into public.escrow_events (loan_id, event_type, note, actor_user_id)
      values (v_loan_id, 'settled', 'All repayments recorded — loan settled', p_actor);
    end if;
  end if;

  return jsonb_build_object('loan_id', v_loan_id, 'remaining', v_remaining);
end;
$$;

revoke execute on function public.start_repayment(uuid, loan_status, uuid) from public;
revoke execute on function public.record_repayment(uuid, uuid) from public;
grant execute on function public.start_repayment(uuid, loan_status, uuid) to service_role;
grant execute on function public.record_repayment(uuid, uuid) to service_role;


-- >>>>> 20260618190000_shipment_proof.sql >>>>>
-- =============================================================================
-- Informal BNPL pilot — proof of shipment (migration 0008)
--
-- Sellers must attach proof when marking an item shipped. We store the object
-- PATH on the loan; the file lives in a private bucket (operators view it
-- server-side via signed URLs).
-- =============================================================================

alter table public.loans
  add column if not exists shipment_proof_path text;

-- Private bucket for shipment proof (no-op on plain Postgres).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('shipment-proof', 'shipment-proof', false)
    on conflict (id) do nothing;
  end if;
end $$;


-- >>>>> 20260618200000_admin_override.sql >>>>>
-- =============================================================================
-- Informal BNPL pilot — admin override (migration 0009)
--
-- Admins (and only admins, enforced in the app layer) can FORCE a loan into a
-- status the normal state machine would disallow — but only with a mandatory
-- reason, which is recorded as a special, immutable 'admin_override'
-- escrow_event. Overrides are visually flagged everywhere they appear.
--
-- This deliberately bypasses the compare-and-swap/transition validation used by
-- the normal RPCs: that is the whole point of an override.
-- =============================================================================

alter type escrow_event_type add value if not exists 'admin_override';

create or replace function public.admin_override_transition(
  p_loan_id uuid,
  p_to      loan_status,
  p_reason  text,
  p_actor   uuid
)
returns public.loans
language plpgsql
as $$
declare
  v_loan public.loans;
  v_from loan_status;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'an override reason is required';
  end if;

  select status into v_from from public.loans where id = p_loan_id for update;
  if v_from is null then
    raise exception 'loan % not found', p_loan_id;
  end if;

  update public.loans set status = p_to where id = p_loan_id
  returning * into v_loan;

  insert into public.escrow_events (loan_id, event_type, note, actor_user_id)
  values (
    p_loan_id, 'admin_override',
    format('OVERRIDE %s -> %s: %s', v_from, p_to, btrim(p_reason)),
    p_actor
  );

  return v_loan;
end;
$$;

revoke execute on function
  public.admin_override_transition(uuid, loan_status, text, uuid) from public;
grant execute on function
  public.admin_override_transition(uuid, loan_status, text, uuid) to service_role;


-- >>>>> 20260618210000_auto_release_cron.sql >>>>>
-- =============================================================================
-- Informal BNPL pilot — scheduled auto-clear of elapsed dispute windows
-- (migration 0010)
--
-- Replaces the "compute on load" clearing with a timed job that runs the SAME
-- window math: any loan that is still `shipped` past dispute_window_days (with
-- no dispute — a dispute would have moved it to dispute_raised) is cleared to
-- `auto_released`. This NEVER pays out — the operator still releases escrow
-- manually. dispute_window_days stays the single knob (read from system_config).
--
-- pg_cron scheduling is wrapped in a safety net: if pg_cron can't be enabled,
-- the migration still succeeds and the function exists (you can enable pg_cron
-- + schedule from the Supabase dashboard, or keep using the on-load surfacing).
-- =============================================================================

create or replace function public.auto_clear_dispute_windows()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days       int;
  v_count      int := 0;
  v_loan       record;
  v_shipped_at timestamptz;
begin
  -- Window length from config; fall back to 7 if missing.
  select (value #>> '{}')::numeric::int into v_days
    from public.system_config
   where key = 'dispute_window_days';
  if v_days is null then v_days := 7; end if;

  for v_loan in select id from public.loans where status = 'shipped'
  loop
    select min(created_at) into v_shipped_at
      from public.escrow_events
     where loan_id = v_loan.id and event_type = 'shipped';

    if v_shipped_at is not null
       and v_shipped_at + make_interval(days => v_days) <= now() then
      -- Compare-and-swap to stay safe against a concurrent buyer action.
      update public.loans set status = 'auto_released'
       where id = v_loan.id and status = 'shipped';
      if found then
        insert into public.escrow_events (loan_id, event_type, note, actor_user_id)
        values (
          v_loan.id, 'auto_released',
          format('Dispute window (%s days) elapsed, no dispute — auto-cleared by scheduler', v_days),
          null  -- system actor
        );
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.auto_clear_dispute_windows() from public;
grant execute on function public.auto_clear_dispute_windows() to service_role;

-- Schedule every 15 minutes when pg_cron is available; no-op / best-effort
-- otherwise.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      begin
        perform cron.unschedule('auto-clear-dispute-windows');
      exception when others then
        null;  -- not scheduled yet
      end;
      perform cron.schedule(
        'auto-clear-dispute-windows',
        '*/15 * * * *',
        'select public.auto_clear_dispute_windows();'
      );
    exception when others then
      raise notice 'pg_cron scheduling skipped: %', sqlerrm;
    end;
  end if;
end
$$;


-- >>>>> 20260618220000_buyer_application.sql >>>>>
-- =============================================================================
-- Informal BNPL pilot — richer buyer application (migration 0011)
--
-- Informal micro-merchants rarely have business papers, so buyer underwriting
-- leans on alternative data (what/where they sell, sourcing, cash flow,
-- references) plus one government ID. We keep the variable application payload
-- in JSONB and promote a few fields to columns for review/metrics.
-- =============================================================================

alter table public.buyer_profiles
  add column if not exists buyer_kind text
    check (buyer_kind in ('business', 'personal')),
  add column if not exists id_document_path text,
  add column if not exists requested_amount_centavos bigint
    check (requested_amount_centavos is null or requested_amount_centavos >= 0),
  add column if not exists application jsonb;

-- Private bucket for the applicant's government ID photo (operators view it
-- server-side via signed URLs). No-op on plain Postgres.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('buyer-id', 'buyer-id', false)
    on conflict (id) do nothing;
  end if;
end $$;


-- >>>>> 20260618230000_datung_pay.sql >>>>>
-- =============================================================================
-- Datung Pay — seller-initiated payment requests + double-entry ledger (0012)
--
-- The merchant's phone is the terminal: a seller mints a tokenized, amount-
-- locked Payment Request and shares it as a QR or an exclusive link. A pre-
-- approved buyer opens it, picks a plan, and authorizes against their REVOLVING
-- credit line — booking a loan instantly (no checkout-time underwriting).
--
-- Every authorization also posts a balanced (double-entry) ledger transaction
-- so the seller-payout obligation is recorded now and settled via rails later.
-- =============================================================================

-- ---- Payment requests (the "Charge" primitive) ------------------------------
create table if not exists public.payment_requests (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,
  seller_user_id  uuid not null references public.users (id),
  amount_centavos bigint not null check (amount_centavos > 0),
  memo            text,
  -- in_person: goods handed over at the stall; ship: escrow until delivered.
  fulfillment     text not null default 'in_person'
                    check (fulfillment in ('in_person', 'ship')),
  status          text not null default 'pending'
                    check (status in ('pending', 'authorized', 'expired', 'cancelled')),
  buyer_user_id   uuid references public.users (id),
  loan_id         uuid references public.loans (id),
  expires_at      timestamptz not null,
  authorized_at   timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists payment_requests_seller_idx
  on public.payment_requests (seller_user_id, created_at desc);

-- All access is server-side via the service role; deny everyone else.
alter table public.payment_requests enable row level security;

-- ---- Double-entry ledger ----------------------------------------------------
-- Each business event is one txn_id whose debits and credits sum equal (the
-- app asserts the balance before insert). Accounts:
--   buyer_receivable    (asset)     — principal the buyer owes us
--   seller_payable      (liability) — net amount we owe the seller
--   merchant_fee_income (income)    — our fee on the sale
create table if not exists public.ledger_entries (
  id              uuid primary key default gen_random_uuid(),
  txn_id          uuid not null,
  loan_id         uuid references public.loans (id),
  account         text not null,
  direction       text not null check (direction in ('debit', 'credit')),
  amount_centavos bigint not null check (amount_centavos > 0),
  memo            text,
  created_at      timestamptz not null default now()
);

create index if not exists ledger_entries_txn_idx on public.ledger_entries (txn_id);
create index if not exists ledger_entries_loan_idx on public.ledger_entries (loan_id);
create index if not exists ledger_entries_account_idx on public.ledger_entries (account);

alter table public.ledger_entries enable row level security;


-- >>>>> 20260619000000_hardening_guards.sql >>>>>
-- =============================================================================
-- Hardening: atomic revolving-credit guard, ledger reconciliation, policies (0013)
--
-- 1. book_loan now enforces the revolving line INSIDE the transaction, taking a
--    row lock on the buyer's profile so concurrent bookings for the same buyer
--    serialize. This removes the check-then-act race that existed when the only
--    limit check lived in application code.
-- 2. A ledger_imbalances view surfaces any transaction whose debits != credits
--    (there should never be one) for reconciliation/alerting.
-- 3. Staff/owner read policies on payment_requests and ledger_entries, matching
--    the rest of the schema (they were RLS-locked with no policies).
-- =============================================================================

-- ---- 1. Atomic revolving-credit guard in book_loan --------------------------
create or replace function public.book_loan(
  p_buyer                 uuid,
  p_seller                uuid,
  p_ticket_centavos       bigint,
  p_tenor_months          int,
  p_interest_rate_monthly numeric,
  p_merchant_fee_pct      numeric,
  p_actor                 uuid default null,
  p_note                  text default null
)
returns public.loans
language plpgsql
as $$
declare
  v_loan        public.loans;
  v_limit       bigint;
  v_outstanding bigint;
begin
  -- Lock the buyer's profile row so two concurrent bookings for the same buyer
  -- can't both pass the available-credit check (check-then-act race).
  select credit_limit_centavos into v_limit
    from public.buyer_profiles
    where user_id = p_buyer
    for update;

  if v_limit is null then
    raise exception 'Buyer has no buyer profile' using errcode = 'check_violation';
  end if;

  -- Outstanding exposure = every loan that hasn't settled or refunded. After
  -- the FOR UPDATE lock above, this sum reflects all committed bookings.
  select coalesce(sum(ticket_centavos), 0) into v_outstanding
    from public.loans
    where buyer_user_id = p_buyer
      and status not in ('settled', 'refunded');

  if p_ticket_centavos > (v_limit - v_outstanding) then
    raise exception
      'Ticket % exceeds available credit (limit %, outstanding %)',
      p_ticket_centavos, v_limit, v_outstanding
      using errcode = 'check_violation';
  end if;

  insert into public.loans (
    buyer_user_id, seller_user_id, ticket_centavos, tenor_months,
    interest_rate_monthly, merchant_fee_pct, status
  )
  values (
    p_buyer, p_seller, p_ticket_centavos, p_tenor_months,
    p_interest_rate_monthly, p_merchant_fee_pct, 'booked'
  )
  returning * into v_loan;

  insert into public.escrow_events
    (loan_id, event_type, amount_centavos, note, actor_user_id)
  values
    (v_loan.id, 'booked', p_ticket_centavos, coalesce(p_note, 'Loan booked'), p_actor);

  return v_loan;
end;
$$;

-- Keep the existing execute grants (book_loan was revoked from public in 0002).
revoke execute on function
  public.book_loan(uuid, uuid, bigint, int, numeric, numeric, uuid, text)
  from public;

-- ---- 2. Ledger reconciliation view ------------------------------------------
-- security_invoker so RLS on ledger_entries still applies to whoever queries it.
create or replace view public.ledger_imbalances
  with (security_invoker = true)
as
select
  txn_id,
  sum(case when direction = 'debit'  then amount_centavos else 0 end) as debits,
  sum(case when direction = 'credit' then amount_centavos else 0 end) as credits
from public.ledger_entries
group by txn_id
having sum(case when direction = 'debit'  then amount_centavos else 0 end)
    <> sum(case when direction = 'credit' then amount_centavos else 0 end);

-- ---- 3. Read policies on the Datung Pay tables ------------------------------
create policy payment_requests_select on public.payment_requests
  for select to authenticated
  using (
    public.is_staff()
    or seller_user_id = auth.uid()
    or buyer_user_id = auth.uid()
  );

create policy ledger_entries_select on public.ledger_entries
  for select to authenticated
  using (public.is_staff());


-- >>>>> 20260619120000_informal_seller_model.sql >>>>>
-- =============================================================================
-- Informal-seller model: verification signals, exposure cap, graduation (0014)
--
-- Target market = regular Filipino shoppers buying from sellers who lack
-- complete business documents (FB live-sellers, sari-sari / palengke / ukay
-- stalls). Trust therefore comes from individual identity + behaviour, not
-- business papers, and the platform absorbs seller risk with a conservative
-- posture: escrow always, a rolling reserve, and a LOW per-seller exposure cap
-- that GRADUATES as the seller racks up clean fulfilments.
-- =============================================================================

-- ---- 1. Verification signals + exposure cap on seller_profiles --------------
alter table public.seller_profiles
  -- Government ID / PhilSys (individual identity, stored in the private bucket)
  add column if not exists id_document_path    text,
  add column if not exists id_type             text,
  -- Storefront / stall photo + where it operates
  add column if not exists storefront_photo_path text,
  add column if not exists storefront_location   text,
  add column if not exists storefront_lat        numeric(9, 6),
  add column if not exists storefront_lng        numeric(9, 6),
  -- Social / marketplace proof (social_handle already exists)
  add column if not exists marketplace_url     text,
  add column if not exists selling_since       text,
  -- Most the platform will carry in unsettled exposure for this seller at once.
  -- Defaults to the conservative "new" tier; raised on graduation.
  add column if not exists max_outstanding_centavos bigint not null default 500000
    check (max_outstanding_centavos >= 0);

-- Existing trusted sellers (seed) get the trusted cap.
update public.seller_profiles
  set max_outstanding_centavos = 5000000
  where trust_tier = 'trusted';

-- ---- 2. book_loan also enforces the per-seller exposure cap -----------------
-- Locks buyer THEN seller profile (consistent order avoids deadlocks) so both
-- the buyer's revolving line and the seller's exposure cap are enforced
-- atomically against concurrent bookings.
create or replace function public.book_loan(
  p_buyer                 uuid,
  p_seller                uuid,
  p_ticket_centavos       bigint,
  p_tenor_months          int,
  p_interest_rate_monthly numeric,
  p_merchant_fee_pct      numeric,
  p_actor                 uuid default null,
  p_note                  text default null
)
returns public.loans
language plpgsql
as $$
declare
  v_loan               public.loans;
  v_limit              bigint;
  v_outstanding        bigint;
  v_seller_cap         bigint;
  v_seller_outstanding bigint;
begin
  -- Buyer revolving line (lock the buyer's profile row first).
  select credit_limit_centavos into v_limit
    from public.buyer_profiles where user_id = p_buyer for update;
  if v_limit is null then
    raise exception 'Buyer has no buyer profile' using errcode = 'check_violation';
  end if;

  select coalesce(sum(ticket_centavos), 0) into v_outstanding
    from public.loans
    where buyer_user_id = p_buyer and status not in ('settled', 'refunded');

  if p_ticket_centavos > (v_limit - v_outstanding) then
    raise exception
      'Ticket % exceeds available credit (limit %, outstanding %)',
      p_ticket_centavos, v_limit, v_outstanding
      using errcode = 'check_violation';
  end if;

  -- Seller exposure cap (lock the seller's profile row second).
  select max_outstanding_centavos into v_seller_cap
    from public.seller_profiles where user_id = p_seller for update;
  if v_seller_cap is null then
    raise exception 'Seller has no seller profile' using errcode = 'check_violation';
  end if;

  select coalesce(sum(ticket_centavos), 0) into v_seller_outstanding
    from public.loans
    where seller_user_id = p_seller and status not in ('settled', 'refunded');

  if p_ticket_centavos > (v_seller_cap - v_seller_outstanding) then
    raise exception
      'Ticket % exceeds seller exposure cap (cap %, outstanding %)',
      p_ticket_centavos, v_seller_cap, v_seller_outstanding
      using errcode = 'check_violation';
  end if;

  insert into public.loans (
    buyer_user_id, seller_user_id, ticket_centavos, tenor_months,
    interest_rate_monthly, merchant_fee_pct, status
  )
  values (
    p_buyer, p_seller, p_ticket_centavos, p_tenor_months,
    p_interest_rate_monthly, p_merchant_fee_pct, 'booked'
  )
  returning * into v_loan;

  insert into public.escrow_events
    (loan_id, event_type, amount_centavos, note, actor_user_id)
  values
    (v_loan.id, 'booked', p_ticket_centavos, coalesce(p_note, 'Loan booked'), p_actor);

  return v_loan;
end;
$$;

revoke execute on function
  public.book_loan(uuid, uuid, bigint, int, numeric, numeric, uuid, text)
  from public;

-- ---- 3. Config defaults for the tier ladder + graduation --------------------
-- updated_by NULL = system default (the seed user doesn't exist yet at migrate time).
insert into public.system_config (key, value, updated_by) values
  ('seller_cap_new_centavos',     '500000',  null),
  ('seller_cap_trusted_centavos', '5000000', null),
  ('seller_reserve_new_pct',      '10',      null),
  ('seller_reserve_trusted_pct',  '5',       null),
  ('seller_graduation_threshold', '10',      null)
on conflict (key) do nothing;

-- ---- 4. Auto-graduation: new -> trusted on clean fulfilments ----------------
-- When a loan settles, a "new" seller with enough settled fulfilments is
-- promoted to "trusted" and gets the higher cap / lower reserve. Operators can
-- still promote/demote by hand (this only ever lifts a "new" seller).
create or replace function public.maybe_graduate_seller()
returns trigger
language plpgsql
as $$
declare
  v_threshold int;
  v_count     int;
  v_cap       bigint;
  v_reserve   numeric;
begin
  v_threshold := coalesce(
    (select (value #>> '{}')::int from public.system_config
       where key = 'seller_graduation_threshold'), 10);

  select count(*) into v_count
    from public.loans
    where seller_user_id = new.seller_user_id and status = 'settled';

  if v_count >= v_threshold then
    v_cap := coalesce(
      (select (value #>> '{}')::bigint from public.system_config
         where key = 'seller_cap_trusted_centavos'), 5000000);
    v_reserve := coalesce(
      (select (value #>> '{}')::numeric from public.system_config
         where key = 'seller_reserve_trusted_pct'), 5);

    update public.seller_profiles
       set trust_tier = 'trusted',
           max_outstanding_centavos = v_cap,
           rolling_reserve_pct = v_reserve
     where user_id = new.seller_user_id and trust_tier = 'new';

    if found then
      insert into public.audit_log (actor_user_id, action, entity_type, entity_id, detail)
      values (null, 'seller_graduated', 'seller_profile', new.seller_user_id::text,
        jsonb_build_object('settled_count', v_count,
                           'new_cap_centavos', v_cap,
                           'new_reserve_pct', v_reserve));
    end if;
  end if;

  return new;
end;
$$;

create trigger seller_graduation_on_settle
  after update on public.loans
  for each row
  when (new.status = 'settled' and old.status is distinct from 'settled')
  execute function public.maybe_graduate_seller();


-- >>>>> 20260619140000_maker_checker_payouts.sql >>>>>
-- =============================================================================
-- Maker-checker seller payouts (migration 0015)
--
-- Closes the money loop without payment rails: a staff "maker" proposes paying
-- a seller their releasable balance; a DIFFERENT staff "checker" approves. On
-- approval we post the settlement leg in the double-entry ledger (debit
-- seller_payable, credit payout_clearing) — recording that the obligation is
-- discharged, to be paid over real rails later. The rolling reserve stays in
-- seller_reserve until separately released.
--
-- "Releasable" = the seller_payable credited for that seller's loans whose
-- escrow has released (escrow_released / repaying / settled), minus payouts
-- already approved.
-- =============================================================================

create table if not exists public.payouts (
  id              uuid primary key default gen_random_uuid(),
  seller_user_id  uuid not null references public.users (id),
  amount_centavos bigint not null check (amount_centavos > 0),
  status          text not null default 'proposed'
                    check (status in ('proposed', 'approved', 'rejected')),
  maker_user_id   uuid not null references public.users (id),
  checker_user_id uuid references public.users (id),
  note            text,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  -- Maker-checker separation of duties: the approver can't be the proposer.
  constraint checker_is_not_maker
    check (checker_user_id is null or checker_user_id <> maker_user_id)
);

create index if not exists payouts_seller_idx on public.payouts (seller_user_id, created_at desc);
create index if not exists payouts_status_idx on public.payouts (status);

-- Per-seller releasable seller_payable (escrow already released). Gross of
-- payouts (those debit seller_payable with no loan_id, so they don't appear in
-- this loan-joined sum); the app subtracts approved payouts to get "available".
create or replace view public.seller_releasable_payable
  with (security_invoker = true)
as
select
  l.seller_user_id,
  sum(case when e.direction = 'credit' then e.amount_centavos else -e.amount_centavos end)
    as releasable_centavos
from public.ledger_entries e
join public.loans l on l.id = e.loan_id
where e.account = 'seller_payable'
  and l.status in ('escrow_released', 'repaying', 'settled')
group by l.seller_user_id;

alter table public.payouts enable row level security;

create policy payouts_select on public.payouts
  for select to authenticated
  using (public.is_staff() or seller_user_id = auth.uid());

-- ---- Atomic approval: re-check availability + post the ledger settlement ----
create or replace function public.approve_payout(p_payout uuid, p_checker uuid)
returns void
language plpgsql
as $$
declare
  v            public.payouts;
  v_releasable bigint;
  v_paid_out   bigint;
  v_txn        uuid;
begin
  select * into v from public.payouts where id = p_payout for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'no_data_found';
  end if;
  if v.status <> 'proposed' then
    raise exception 'Payout already decided' using errcode = 'check_violation';
  end if;
  if v.maker_user_id = p_checker then
    raise exception 'Maker cannot approve their own payout' using errcode = 'check_violation';
  end if;

  -- Releasable seller_payable for this seller (escrow already released).
  select coalesce(sum(case when e.direction = 'credit'
                           then e.amount_centavos else -e.amount_centavos end), 0)
    into v_releasable
    from public.ledger_entries e
    join public.loans l on l.id = e.loan_id
    where e.account = 'seller_payable'
      and l.seller_user_id = v.seller_user_id
      and l.status in ('escrow_released', 'repaying', 'settled');

  select coalesce(sum(amount_centavos), 0) into v_paid_out
    from public.payouts
    where seller_user_id = v.seller_user_id and status = 'approved' and id <> p_payout;

  if v.amount_centavos > (v_releasable - v_paid_out) then
    raise exception 'Payout % exceeds available payable (releasable %, already paid %)',
      v.amount_centavos, v_releasable, v_paid_out
      using errcode = 'check_violation';
  end if;

  -- Balanced settlement: we owe the seller less; cash is staged for rails.
  v_txn := gen_random_uuid();
  insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos, memo) values
    (v_txn, null, 'seller_payable',  'debit',  v.amount_centavos, 'Seller payout settlement'),
    (v_txn, null, 'payout_clearing', 'credit', v.amount_centavos, 'Payout staged for rails');

  update public.payouts
     set status = 'approved', checker_user_id = p_checker, decided_at = now()
   where id = p_payout;
end;
$$;

revoke execute on function public.approve_payout(uuid, uuid) from public;
grant execute on function public.approve_payout(uuid, uuid) to service_role;


-- >>>>> 20260619160000_repayment_ledger.sql >>>>>
-- =============================================================================
-- Complete the buyer-side ledger: repayments draw down the receivable (0016)
--
-- At disbursement we debit buyer_receivable for the principal. Until now nothing
-- credited it back as the buyer repaid, so the asset grew forever and interest
-- was never recognised. This closes that loop, mirroring the seller payout leg:
--
--   on each installment paid →  DR cash_clearing      (full installment)
--                               CR buyer_receivable   (principal portion)
--                               CR interest_income    (interest portion)
--
-- To split cleanly we persist the principal/interest of each installment when
-- the schedule is built (the amount already includes flat monthly interest).
-- =============================================================================

alter table public.repayments
  add column if not exists principal_centavos bigint,
  add column if not exists interest_centavos  bigint;

-- ---- start_repayment: also persist the principal/interest split -------------
create or replace function public.start_repayment(
  p_loan_id uuid,
  p_from    loan_status,
  p_actor   uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_loan             public.loans;
  v_monthly_interest bigint;
  v_total            bigint;
  v_base             bigint;
  v_amount           bigint;
  i                  int;
begin
  update public.loans
     set status = 'repaying'
   where id = p_loan_id
     and status = p_from
  returning * into v_loan;

  if not found then
    raise exception
      'loan % is not in expected state % (concurrent change or wrong from-state)',
      p_loan_id, p_from
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.repayments where loan_id = p_loan_id) then
    return jsonb_build_object('loan_id', p_loan_id, 'installments', 0,
                              'note', 'schedule already existed');
  end if;

  v_monthly_interest := round(v_loan.ticket_centavos * v_loan.interest_rate_monthly)::bigint;
  v_total := v_loan.ticket_centavos + v_monthly_interest * v_loan.tenor_months;
  v_base := v_total / v_loan.tenor_months;  -- integer (floor) division

  for i in 1 .. v_loan.tenor_months loop
    if i < v_loan.tenor_months then
      v_amount := v_base;
    else
      v_amount := v_total - v_base * (v_loan.tenor_months - 1);  -- remainder on last
    end if;

    -- Flat interest per installment; principal is the rest (last absorbs the
    -- amount remainder, so its principal does too). Sum(principal) == ticket.
    insert into public.repayments
      (loan_id, amount_centavos, principal_centavos, interest_centavos, due_date, status)
    values (p_loan_id, v_amount, v_amount - v_monthly_interest, v_monthly_interest,
            (current_date + (i || ' month')::interval)::date, 'pending');
  end loop;

  insert into public.escrow_events (loan_id, event_type, amount_centavos, note, actor_user_id)
  values (p_loan_id, 'note', v_total,
          format('Repayment schedule created: %s installments, total %s centavos (incl. interest)',
                 v_loan.tenor_months, v_total),
          p_actor);

  return jsonb_build_object(
    'loan_id', p_loan_id,
    'installments', v_loan.tenor_months,
    'total_centavos', v_total,
    'monthly_interest_centavos', v_monthly_interest
  );
end;
$$;

-- ---- record_repayment: post the balanced buyer-side ledger drawdown ---------
create or replace function public.record_repayment(
  p_repayment_id uuid,
  p_actor        uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_loan_id   uuid;
  v_amount    bigint;
  v_principal bigint;
  v_interest  bigint;
  v_remaining int;
  v_txn       uuid;
begin
  -- CAS: only the first call flips pending -> paid, so the ledger leg below is
  -- posted exactly once (idempotent — a repeat raises before any posting).
  update public.repayments
     set status = 'paid', paid_at = now()
   where id = p_repayment_id
     and status <> 'paid'
  returning loan_id, amount_centavos,
            coalesce(interest_centavos, 0),
            coalesce(principal_centavos, amount_centavos - coalesce(interest_centavos, 0))
    into v_loan_id, v_amount, v_interest, v_principal;

  if not found then
    raise exception 'repayment % not found or already paid', p_repayment_id
      using errcode = 'check_violation';
  end if;

  insert into public.escrow_events (loan_id, event_type, amount_centavos, note, actor_user_id)
  values (v_loan_id, 'repayment_recorded', v_amount, 'Repayment recorded', p_actor);

  -- Balanced double-entry: cash in, receivable down (principal), interest earned.
  -- principal + interest = amount, so debits = credits. Skip any zero line
  -- (ledger requires positive amounts; e.g. a zero-rate loan has no interest).
  if v_amount > 0 then
    v_txn := gen_random_uuid();
    insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos, memo)
    values (v_txn, v_loan_id, 'cash_clearing', 'debit', v_amount, 'Repayment received');
    if v_principal > 0 then
      insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos, memo)
      values (v_txn, v_loan_id, 'buyer_receivable', 'credit', v_principal, 'Principal repaid');
    end if;
    if v_interest > 0 then
      insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos, memo)
      values (v_txn, v_loan_id, 'interest_income', 'credit', v_interest, 'Interest earned');
    end if;
  end if;

  select count(*) into v_remaining
    from public.repayments
   where loan_id = v_loan_id and status not in ('paid', 'waived');

  -- Auto-settle once nothing is outstanding (system transition repaying -> settled).
  if v_remaining = 0 then
    update public.loans set status = 'settled'
     where id = v_loan_id and status = 'repaying';
    if found then
      insert into public.escrow_events (loan_id, event_type, note, actor_user_id)
      values (v_loan_id, 'settled', 'All repayments recorded — loan settled', p_actor);
    end if;
  end if;

  return jsonb_build_object('loan_id', v_loan_id, 'remaining', v_remaining);
end;
$$;

revoke execute on function public.start_repayment(uuid, loan_status, uuid) from public;
revoke execute on function public.record_repayment(uuid, uuid) from public;
grant execute on function public.start_repayment(uuid, loan_status, uuid) to service_role;
grant execute on function public.record_repayment(uuid, uuid) to service_role;


-- >>>>> 20260624000000_seller_ocr.sql >>>>>
-- Seller-side OCR results (operator-triggered, Tesseract). Stored on the seller
-- profile so the operator sees extracted text from the government ID and the
-- storefront photo when verifying. Mirrors the buyer OCR (which lives in the
-- buyer application JSONB); seller_profiles has no JSONB, so use plain columns.
alter table public.seller_profiles
  add column if not exists ocr_id_text         text,
  add column if not exists ocr_storefront_text text;

-- >>>>> 20260625000000_seller_referrals.sql >>>>>
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
