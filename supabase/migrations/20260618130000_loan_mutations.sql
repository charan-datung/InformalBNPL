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
