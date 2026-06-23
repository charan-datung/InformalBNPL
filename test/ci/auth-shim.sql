-- Minimal stand-in for Supabase's managed `auth` schema, so the app migrations
-- (which reference auth.users, auth.uid(), and the anon/authenticated/service
-- roles) can be applied against a plain Postgres in CI and local test harnesses.
-- This is NEVER applied to a real Supabase database — Supabase provides these.
create schema if not exists auth;

create table if not exists auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz,
  updated_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  confirmation_token text, recovery_token text, email_change_token_new text,
  email_change text
);

create table if not exists auth.identities (
  id uuid, user_id uuid references auth.users (id) on delete cascade, provider_id text,
  provider text, identity_data jsonb, created_at timestamptz, updated_at timestamptz,
  last_sign_in_at timestamptz, primary key (provider_id, provider)
);

create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
