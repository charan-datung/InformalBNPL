-- =============================================================================
-- Informal BNPL pilot — seller verification photo (migration 0003)
--
-- Sellers must upload a live item photo during verification. We store the
-- object PATH on the seller profile; the file itself lives in a private
-- Storage bucket. Uploads/reads go through the service role (operators review
-- the photo server-side), so the bucket stays private with no public policies.
-- =============================================================================

alter table public.seller_profiles
  add column if not exists verification_photo_path text;

-- Create the private bucket only when running against Supabase (the `storage`
-- schema exists there). This block is a no-op on a plain Postgres instance.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('seller-verification', 'seller-verification', false)
    on conflict (id) do nothing;
  end if;
end $$;
