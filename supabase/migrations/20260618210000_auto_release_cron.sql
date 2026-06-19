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
