-- =============================================================================
-- Informal BNPL pilot — unified staff audit log (migration 0005)
--
-- escrow_events captures the loan lifecycle. audit_log captures the OTHER staff
-- actions that aren't loan-scoped — profile approvals/rejections, config
-- changes, dispute decisions — in one append-only place. Never updated/deleted
-- (reuses the prevent_mutation trigger from migration 0001).
-- =============================================================================

create table public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users (id),     -- null = system
  action        text not null,                         -- e.g. 'buyer_approved'
  entity_type   text not null,                         -- 'buyer_profile' | 'seller_profile' | 'system_config' | 'dispute'
  entity_id     text,                                  -- the affected row's id / config key
  detail        jsonb,                                 -- arbitrary context (from/to values, notes)
  created_at    timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.prevent_mutation();

-- Staff read all; writes happen server-side via the service role.
alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.is_staff());

grant select on public.audit_log to authenticated;
