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
