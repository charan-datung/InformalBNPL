-- =============================================================================
-- WebAuthn / passkey credentials (migration 0022)
--
-- Stores platform-authenticator (Face ID / Touch ID / Android biometric)
-- credentials so users can add biometric sign-in as an additional login option
-- alongside email + password. One row per registered passkey. All writes go
-- through the service role in the /api/webauthn route handlers; users may read
-- their own rows (to list/manage their passkeys).
-- =============================================================================

create table if not exists public.webauthn_credentials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  credential_id text not null unique,          -- base64url credential id
  public_key    text not null,                 -- base64url COSE public key
  counter       bigint not null default 0,     -- signature counter (clone detect)
  transports    text[],                        -- e.g. {internal,hybrid}
  device_label  text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists webauthn_credentials_user_idx
  on public.webauthn_credentials (user_id);

alter table public.webauthn_credentials enable row level security;

-- A user can see their own passkeys (for a "manage devices" list). Inserts /
-- updates happen via the service role after server-side attestation/assertion
-- verification, so there are deliberately no insert/update policies.
drop policy if exists webauthn_own_select on public.webauthn_credentials;
create policy webauthn_own_select on public.webauthn_credentials
  for select using (user_id = auth.uid());
