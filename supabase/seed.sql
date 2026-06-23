-- =============================================================================
-- Informal BNPL pilot — seed data
--
-- Creates: 1 admin, 1 operator, and 3 normal users
--   (buyer-only, seller-only, and one with BOTH capabilities).
--
-- All accounts share the password:  password123
--
-- NOTE: This inserts directly into auth.users, which works for LOCAL Supabase
-- (`supabase db reset`) and self-hosted GoTrue. On a HOSTED Supabase project
-- you typically create users via the dashboard or Auth API instead; in that
-- case skip the auth.users block and run only the profile + config sections,
-- substituting the real user UUIDs.
--
-- The on_auth_user_created trigger auto-creates the matching public.users rows
-- from the metadata below, so we only UPDATE staff_role / add profiles here.
-- =============================================================================

-- Fixed UUIDs so the relationships are easy to follow:
--   1111… admin       2222… operator
--   3333… buyer-only  4444… seller-only  5555… buyer + seller

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'admin@bnpl.test',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Ana Admin","contact":"+63 900 000 0001"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'operator@bnpl.test',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Ondoy Operator","contact":"+63 900 000 0002"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'buyer@bnpl.test',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Benita Buyer","contact":"+63 900 000 0003"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'seller@bnpl.test',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Selmo Seller","contact":"+63 900 000 0004"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'both@bnpl.test',
   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Bea Both","contact":"+63 900 000 0005"}', '', '', '', '');

-- Identities (auth.users -> auth.identities) so email/password login resolves.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
)
select
  u.id, u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555'
);

-- ---- Staff roles (public.users rows already exist via the trigger) ----------
update public.users set staff_role = 'admin'
  where id = '11111111-1111-1111-1111-111111111111';
update public.users set staff_role = 'operator'
  where id = '22222222-2222-2222-2222-222222222222';

-- ---- Capabilities -----------------------------------------------------------
-- Buyer-only user: a verified, activated buyer with a ₱50,000 limit.
insert into public.buyer_profiles
  (user_id, kyc_status, credit_limit_centavos, underwriting_notes, activated_at)
values
  ('33333333-3333-3333-3333-333333333333', 'verified', 5000000,
   'Pilot test buyer.', now());

-- Seller-only user: a verified, trusted seller with a 10% rolling reserve.
insert into public.seller_profiles
  (user_id, social_handle, kyc_status, trust_tier, rolling_reserve_pct,
   verification_notes, activated_at)
values
  ('44444444-4444-4444-4444-444444444444', '@selmo_shop', 'verified', 'trusted',
   10.00, 'Pilot test seller.', now());

-- Both: one identity holding BOTH a buyer and a seller profile.
insert into public.buyer_profiles
  (user_id, kyc_status, credit_limit_centavos, underwriting_notes, activated_at)
values
  ('55555555-5555-5555-5555-555555555555', 'verified', 3000000,
   'Pilot test buyer+seller (buyer side).', now());

insert into public.seller_profiles
  (user_id, social_handle, kyc_status, trust_tier, rolling_reserve_pct,
   verification_notes, activated_at)
values
  ('55555555-5555-5555-5555-555555555555', '@bea_both', 'verified', 'new',
   15.00, 'Pilot test buyer+seller (seller side).', now());

-- (admin and operator intentionally have NEITHER profile — staff are not
--  buyers or sellers, demonstrating the "neither" case.)

-- ---- System config overrides (keys mirror src/lib/config/system-config.ts) --
insert into public.system_config (key, value, updated_by) values
  ('dispute_window_days',           '7',       '11111111-1111-1111-1111-111111111111'),
  ('auto_release_days',             '3',       '11111111-1111-1111-1111-111111111111'),
  ('default_interest_rate_monthly', '0.035',   '11111111-1111-1111-1111-111111111111'),
  ('default_merchant_fee_pct',      '5',       '11111111-1111-1111-1111-111111111111'),
  ('default_reserve_pct',           '10',      '11111111-1111-1111-1111-111111111111'),
  ('default_credit_limit_centavos', '5000000', '11111111-1111-1111-1111-111111111111'),
  ('default_tenor_months',          '3',       '11111111-1111-1111-1111-111111111111'),
  ('seller_payout_days',            '2',       '11111111-1111-1111-1111-111111111111'),
  ('seller_cap_new_centavos',       '500000',  '11111111-1111-1111-1111-111111111111'),
  ('seller_cap_trusted_centavos',   '5000000', '11111111-1111-1111-1111-111111111111'),
  ('seller_reserve_new_pct',        '10',      '11111111-1111-1111-1111-111111111111'),
  ('seller_reserve_trusted_pct',    '5',       '11111111-1111-1111-1111-111111111111'),
  ('seller_graduation_threshold',   '10',      '11111111-1111-1111-1111-111111111111')
on conflict (key) do nothing;
