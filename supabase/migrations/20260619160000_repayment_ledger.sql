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
