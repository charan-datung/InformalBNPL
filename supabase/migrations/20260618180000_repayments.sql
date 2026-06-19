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
