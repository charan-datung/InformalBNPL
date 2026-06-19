-- ============================================================
-- Informal BNPL — RESET (safe for the pilot; there is no real data yet).
--
-- Use this if a previous setup attempt half-finished and you get errors
-- like: type "staff_role" already exists.
--
-- Paste this whole file into the Supabase SQL Editor and Run. Then run
-- full_schema.sql, then seed.sql.
-- ============================================================

-- Remove everything the app created, and put back a clean, empty schema.
drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, anon, authenticated, service_role;

-- Clear any test logins created by a previous seed attempt, so seed.sql
-- can recreate them cleanly.
delete from auth.users
where email in (
  'admin@bnpl.test',
  'operator@bnpl.test',
  'buyer@bnpl.test',
  'seller@bnpl.test',
  'both@bnpl.test'
);
