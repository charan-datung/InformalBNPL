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
