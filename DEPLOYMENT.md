# Deploying Datung

A pre-flight checklist for shipping the app to production (Vercel + Supabase).
Work top to bottom — the **blockers** section must be green before you go live.

---

## 0. One-shot schema check

Before anything else, run [`scripts/verify-prod-schema.sql`](./scripts/verify-prod-schema.sql)
in the Supabase **SQL Editor** against your production project. Every row should
report `OK`. Anything `MISSING` points at the step below that fixes it.

---

## 1. Blockers (must be done)

### 1a. Apply all database migrations
The repo holds the source-of-truth migrations in `supabase/migrations/`. They
must all be applied to the production database.

**With the Supabase CLI (recommended):**
```bash
supabase link --project-ref <your-project-ref>
supabase db push          # applies any migrations not yet on the remote
```

**Without the CLI:** open each unapplied file in `supabase/migrations/` (in
filename order) in the SQL Editor and run it. They are written to be safe to
re-run. The most recently added is `20260624000000_seller_ocr.sql` (seller OCR
columns) — a common one to be missing.

### 1b. Storage buckets
Two private buckets are required and are created by the migrations:
- `buyer-id` — buyer ID + proof-of-billing uploads
- `seller-verification` — seller ID, storefront, and live-item photos

If `verify-prod-schema.sql` reports them missing, the storage migrations
(`..._seller_verification_storage.sql`, `..._buyer_application.sql`) didn't run.

### 1c. Environment variables (Vercel → Project → Settings → Environment Variables)
The server **fails to boot** without these (by design — see `src/lib/env.ts`):
| Var | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL, e.g. `https://abc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe in browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Server-only. Bypasses RLS. |
| `SENTRY_DSN` | Optional — error forwarding. Leave blank for the pilot. |

Set them for the **Production** (and Preview, if used) environments.

### 1d. Auth URL configuration (fixes the email-confirmation redirect)
Supabase → **Authentication → URL Configuration**:
- **Site URL**: your production domain, e.g. `https://yourapp.vercel.app`
- **Redirect URLs**: add `https://yourapp.vercel.app/**`

Then make confirmation links robust across devices. Supabase →
**Authentication → Email Templates → Confirm signup**, set the link to the
OTP/`token_hash` style (our callback at `/auth/confirm` handles it and it works
even when the email is opened on a different device than sign-up):
```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/onboarding">
  Confirm your email
</a>
```
If you keep the default `{{ .ConfirmationURL }}` (PKCE `?code=`) instead, it only
works in the same browser that started sign-up. Either way the callback now
surfaces the real reason on `/login` if a link fails (expired, already used,
redirect not allow-listed).

---

## 2. Should-do (operational correctness)

### 2a. pg_cron (auto-release of escrow)
`20260618210000_auto_release_cron.sql` schedules escrow auto-release. It needs
the `pg_cron` extension: Supabase → **Database → Extensions → enable `pg_cron`**,
then re-run that migration if the job wasn't created.

### 2b. A staff account
You need at least one user with `staff_role` set to reach `/operator`:
```sql
update public.users set staff_role = 'admin' where id = '<your-auth-user-id>';
```

### 2c. System config (optional)
`system_config` overrides are optional — the app falls back to the defaults in
`src/lib/config/system-config.ts`. Seed overrides only if you want non-default
rates/limits.

### 2d. Function duration (Vercel plan)
The operator OCR actions set `maxDuration = 60` (cold-start model download +
recognition). Hobby allows up to 60s; if you see OCR time out, a Pro plan raises
the ceiling.

---

## 3. Verify after deploy

1. `GET /health` returns OK (reports env/Supabase status).
2. Sign up a new account → confirmation link → lands on `/onboarding`.
3. Submit a buyer application → appears under `/operator/reviews/buyers`.
4. Approve it (as staff) → buyer dashboard goes active; member shows in
   `/operator/members`.
5. Run OCR on a seller upload → extracted text appears (not "OCR failed").

---

## Quick reference

- **Migrations:** `supabase/migrations/` (apply with `supabase db push`)
- **Schema check:** `scripts/verify-prod-schema.sql`
- **Required env:** `src/lib/env.ts` (`REQUIRED_SERVER_ENV`)
- **Boot validation:** `src/instrumentation.ts`
- **Auth callback:** `src/app/auth/confirm/route.ts`
