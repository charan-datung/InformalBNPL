-- =============================================================================
-- Capitalized processing fee (migration 0018)
--
-- A one-time processing/service fee is now CAPITALIZED on top of the purchase to
-- form a higher loan principal, and interest accrues on that fee-inclusive
-- amount. Mirrors src/lib/loans/finance.ts (computeLoanTerms) exactly so the
-- borrower's disclosed schedule equals the schedule generated here.
--
--   processing_fee = round(ticket * processing_fee_pct/100)   (stored on the loan)
--   loan_amount    = ticket + processing_fee                  (the principal)
--   interest       = round(loan_amount * rate) * tenor        (flat, on loan_amount)
--   total          = loan_amount + interest
-- =============================================================================

-- Self-contained prerequisites: this migration recreates book_loan/start_repayment
-- with both payment frequency and the capitalized fee, so it must not assume the
-- amortization-frequency migration (0017) was applied first. Create the type and
-- columns only if they're missing — no-ops when 0017 already ran.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_frequency') then
    create type public.payment_frequency as enum ('monthly', 'biweekly');
  end if;
end $$;

alter table public.loans
  add column if not exists payment_frequency public.payment_frequency not null default 'monthly';

alter table public.loans
  add column if not exists processing_fee_centavos bigint not null default 0;

-- ---- book_loan: compute + store the capitalized processing fee ----------------
-- Drop EVERY existing book_loan overload by looking them up dynamically, so no
-- statement has to name the payment_frequency enum in a signature (which would
-- error if the type were somehow absent). Recreated below with the new param.
do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure::text as sig
    from pg_proc
    where proname = 'book_loan'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

create or replace function public.book_loan(
  p_buyer                 uuid,
  p_seller                uuid,
  p_ticket_centavos       bigint,
  p_tenor_months          int,
  p_interest_rate_monthly numeric,
  p_merchant_fee_pct      numeric,
  p_actor                 uuid default null,
  p_note                  text default null,
  p_payment_frequency     public.payment_frequency default 'monthly',
  p_processing_fee_pct    numeric default 0
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
  v_processing_fee     bigint;
begin
  -- Buyer revolving line (lock the buyer's profile row first). Exposure is the
  -- PURCHASE amount (ticket); the capitalized fee is a charge on top.
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

  v_processing_fee := round(p_ticket_centavos * coalesce(p_processing_fee_pct, 0) / 100)::bigint;

  insert into public.loans (
    buyer_user_id, seller_user_id, ticket_centavos, tenor_months,
    interest_rate_monthly, merchant_fee_pct, status, payment_frequency,
    processing_fee_centavos
  )
  values (
    p_buyer, p_seller, p_ticket_centavos, p_tenor_months,
    p_interest_rate_monthly, p_merchant_fee_pct, 'booked', p_payment_frequency,
    v_processing_fee
  )
  returning * into v_loan;

  insert into public.escrow_events
    (loan_id, event_type, amount_centavos, note, actor_user_id)
  values
    (v_loan.id, 'booked', p_ticket_centavos, coalesce(p_note, 'Loan booked'), p_actor);

  return v_loan;
end;
$$;

revoke execute on function public.book_loan(
  uuid, uuid, bigint, int, numeric, numeric, uuid, text, public.payment_frequency, numeric
) from public;
grant execute on function public.book_loan(
  uuid, uuid, bigint, int, numeric, numeric, uuid, text, public.payment_frequency, numeric
) to service_role;

-- ---- start_repayment: amortize the fee-inclusive loan amount -------------------
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
  v_loan_amount      bigint;
  v_monthly_interest bigint;
  v_total            bigint;
  v_periods          int;
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

  -- Principal = purchase + capitalized processing fee; interest accrues on it.
  v_loan_amount      := v_loan.ticket_centavos + coalesce(v_loan.processing_fee_centavos, 0);
  v_monthly_interest := round(v_loan_amount * v_loan.interest_rate_monthly)::bigint;
  v_total            := v_loan_amount + v_monthly_interest * v_loan.tenor_months;
  v_periods := case
                 when v_loan.payment_frequency = 'biweekly'
                   then v_loan.tenor_months * 2
                 else v_loan.tenor_months
               end;
  v_base := v_total / v_periods;  -- integer (floor) division

  for i in 1 .. v_periods loop
    if i < v_periods then
      v_amount := v_base;
    else
      v_amount := v_total - v_base * (v_periods - 1);  -- remainder on last
    end if;

    insert into public.repayments (loan_id, amount_centavos, due_date, status)
    values (
      p_loan_id, v_amount,
      case
        when v_loan.payment_frequency = 'biweekly'
          then (current_date + (i * 14 || ' day')::interval)::date
        else (current_date + (i || ' month')::interval)::date
      end,
      'pending'
    );
  end loop;

  insert into public.escrow_events (loan_id, event_type, amount_centavos, note, actor_user_id)
  values (p_loan_id, 'note', v_total,
          format('Repayment schedule created: %s %s installments, total %s centavos (incl. fee + interest)',
                 v_periods, v_loan.payment_frequency, v_total),
          p_actor);

  return jsonb_build_object(
    'loan_id', p_loan_id,
    'installments', v_periods,
    'total_centavos', v_total,
    'loan_amount_centavos', v_loan_amount,
    'monthly_interest_centavos', v_monthly_interest
  );
end;
$$;

revoke execute on function public.start_repayment(uuid, loan_status, uuid) from public;
grant execute on function public.start_repayment(uuid, loan_status, uuid) to service_role;
