-- =============================================================================
-- Document acceptances (migration 0019)
--
-- An append-only record of every legal document a borrower accepts: the master
-- Credit Agreement (once, loan_id null) and the per-loan Disclosure Statement /
-- Promissory Note (loan_id set). Captures the typed-name e-signature, the
-- document version, the client IP, and a JSON snapshot of the exact terms the
-- borrower agreed to — the evidence a regulated lender needs that disclosure
-- happened before the credit was consummated (RA 3765 / RA 8792).
--
-- Written only by the service role (no RLS policies → no anon/auth access).
-- =============================================================================

create table if not exists public.document_acceptances (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  -- Null for the master Credit Agreement; set for per-loan documents.
  loan_id          uuid references public.loans(id) on delete cascade,
  document_type    text not null,           -- 'credit_agreement' | 'disclosure_statement'
  document_version text not null,
  signature_name   text not null,           -- typed-name e-signature
  ip_address       text,
  terms_snapshot   jsonb,                    -- computed LoanTerms at acceptance
  accepted_at      timestamptz not null default now()
);

create index if not exists document_acceptances_user_idx
  on public.document_acceptances (user_id);
create index if not exists document_acceptances_loan_idx
  on public.document_acceptances (loan_id);

alter table public.document_acceptances enable row level security;
-- No policies: only the service-role client (which bypasses RLS) may read/write.
