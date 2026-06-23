-- =============================================================================
-- Informal BNPL pilot — richer buyer application (migration 0011)
--
-- Informal micro-merchants rarely have business papers, so buyer underwriting
-- leans on alternative data (what/where they sell, sourcing, cash flow,
-- references) plus one government ID. We keep the variable application payload
-- in JSONB and promote a few fields to columns for review/metrics.
-- =============================================================================

alter table public.buyer_profiles
  add column if not exists buyer_kind text
    check (buyer_kind in ('business', 'personal')),
  add column if not exists id_document_path text,
  add column if not exists requested_amount_centavos bigint
    check (requested_amount_centavos is null or requested_amount_centavos >= 0),
  add column if not exists application jsonb;

-- Private bucket for the applicant's government ID photo (operators view it
-- server-side via signed URLs). No-op on plain Postgres.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('buyer-id', 'buyer-id', false)
    on conflict (id) do nothing;
  end if;
end $$;
