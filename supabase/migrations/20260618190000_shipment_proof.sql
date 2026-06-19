-- =============================================================================
-- Informal BNPL pilot — proof of shipment (migration 0008)
--
-- Sellers must attach proof when marking an item shipped. We store the object
-- PATH on the loan; the file lives in a private bucket (operators view it
-- server-side via signed URLs).
-- =============================================================================

alter table public.loans
  add column if not exists shipment_proof_path text;

-- Private bucket for shipment proof (no-op on plain Postgres).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('shipment-proof', 'shipment-proof', false)
    on conflict (id) do nothing;
  end if;
end $$;
