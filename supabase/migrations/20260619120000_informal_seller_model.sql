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
