-- =============================================================================
-- Support requests (migration 0020)
--
-- Buyers and sellers can contact support from their profile. Each message lands
-- here for the operator console to triage and resolve. (A later phase will email
-- operators when a new request arrives.) Service-role only (RLS, no policies).
-- =============================================================================

create table if not exists public.support_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  -- Which surface the request came from: 'buyer' | 'seller' | 'general'.
  context     text not null default 'general',
  subject     text,
  message     text not null,
  -- Optional contact the user wants us to reply to (else use their profile).
  contact     text,
  status      text not null default 'open',  -- 'open' | 'resolved'
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id)
);

create index if not exists support_requests_status_idx
  on public.support_requests (status, created_at desc);
create index if not exists support_requests_user_idx
  on public.support_requests (user_id);

alter table public.support_requests enable row level security;
-- No policies: only the service-role client (which bypasses RLS) may read/write.
