-- =============================================================================
-- Amortization frequency — biweekly / monthly repayment plans (migration 0017)
--
-- Buyers can now choose to repay a loan either monthly or every two weeks. The
-- frequency does NOT change the cost: interest stays tied to the tenor in
-- MONTHS; biweekly simply splits the same total into twice as many, smaller,
-- closer-together installments. Mirrors src/lib/loans/schedule.ts exactly.
--
--   periods = monthly ? tenor : tenor * 2
--   total   = ticket + round(ticket * rate) * tenor      (unchanged)
--   each    = floor(total / periods); last absorbs the remainder
--   due     = monthly: +i months ; biweekly: +i*14 days
-- =============================================================================

create type public.payment_frequency as enum ('monthly', 'biweekly');

alter table public.loans
  add column payment_frequency public.payment_frequency not null default 'monthly';

-- ---- book_loan: now records the chosen repayment frequency --------------------
-- Recreated from migration 0015 (informal_seller_model) with one added param.
-- All buyer-credit and seller-exposure guards are preserved verbatim.
create or replace function public.book_loan(
  p_buyer                 uuid,
  p_seller                uuid,
  p_ticket_centavos       bigint,
  p_tenor_months          int,
  p_interest_rate_monthly numeric,
  p_merchant_fee_pct      numeric,
  p_actor                 uuid default null,
  p_note                  text default null,
  p_payment_frequency     public.payment_frequency default 'monthly'
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
    interest_rate_monthly, merchant_fee_pct, status, payment_frequency
  )
  values (
    p_buyer, p_seller, p_ticket_centavos, p_tenor_months,
    p_interest_rate_monthly, p_merchant_fee_pct, 'booked', p_payment_frequency
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
  public.book_loan(uuid, uuid, bigint, int, numeric, numeric, uuid, text, public.payment_frequency)
  from public;
grant execute on function
  public.book_loan(uuid, uuid, bigint, int, numeric, numeric, uuid, text, public.payment_frequency)
  to service_role;

-- ---- start_repayment: generate the schedule honouring the frequency ----------
-- Recreated from migration 0007 with frequency-aware period count + due dates.
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

  -- Generate the schedule only once.
  if exists (select 1 from public.repayments where loan_id = p_loan_id) then
    return jsonb_build_object('loan_id', p_loan_id, 'installments', 0,
                              'note', 'schedule already existed');
  end if;

  v_monthly_interest := round(v_loan.ticket_centavos * v_loan.interest_rate_monthly)::bigint;
  -- Interest is duration-based (tenor in months), independent of frequency.
  v_total := v_loan.ticket_centavos + v_monthly_interest * v_loan.tenor_months;
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
          format('Repayment schedule created: %s %s installments, total %s centavos (incl. interest)',
                 v_periods, v_loan.payment_frequency, v_total),
          p_actor);

  return jsonb_build_object(
    'loan_id', p_loan_id,
    'installments', v_periods,
    'total_centavos', v_total,
    'monthly_interest_centavos', v_monthly_interest
  );
end;
$$;

revoke execute on function public.start_repayment(uuid, loan_status, uuid) from public;
grant execute on function public.start_repayment(uuid, loan_status, uuid) to service_role;
