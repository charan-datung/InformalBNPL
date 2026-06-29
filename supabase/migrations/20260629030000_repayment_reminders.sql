-- =============================================================================
-- Payment-reminder log (migration 0023)
--
-- Records which reminder emails have gone out for an installment so the daily
-- reminder cron is idempotent and never spams (at most one 'upcoming' and one
-- 'overdue' per installment). Written by the service role from the cron route.
-- =============================================================================

create table if not exists public.repayment_reminders (
  id           uuid primary key default gen_random_uuid(),
  repayment_id uuid not null references public.repayments (id) on delete cascade,
  kind         text not null,                 -- 'upcoming' | 'overdue'
  sent_at      timestamptz not null default now(),
  unique (repayment_id, kind)
);

create index if not exists repayment_reminders_repayment_idx
  on public.repayment_reminders (repayment_id);

alter table public.repayment_reminders enable row level security;
-- No policies: only the service-role cron reads/writes this table.
