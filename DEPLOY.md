# Pilot deployment runbook

How to stand up Datung for the first test pilot. Hosting is **Vercel**, data is
**Supabase** (Postgres + Auth + Storage). Payment rails are intentionally out of
scope — seller payouts are recorded via maker-checker and settled over rails
later.

## 1. Provision Supabase

1. Create a Supabase project (free tier is fine for the pilot).
2. **Authentication → Sign In / Providers → Email**: enable the Email provider.
   For a faster pilot you may disable "Confirm email".
3. Grab from **Project Settings → API**:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Apply the schema

In the Supabase **SQL Editor**, paste and run **`supabase/full_schema.sql`**
(all 15 migrations in order). This creates every table, the RLS policies, the
loan/payout functions, and — because it runs on Supabase where the `storage`
schema exists — the private storage buckets (`seller-verification`, `buyer-id`,
`shipment-proof`, `dispute-evidence`) via the guarded blocks.

- **Do NOT run `supabase/seed.sql` in production** — it inserts test accounts
  that reference dashboard auth users you don't have. System config falls back
  to the code defaults in `src/lib/config/system-config.ts`, and operators can
  override any value later from the **Config** page.

Verify: the SQL Editor should report success with no errors, and
**Storage** should list the four buckets.

## 3. Deploy to Vercel

1. Import the Git repo into Vercel (framework auto-detected as Next.js).
2. Set the environment variables (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SENTRY_DSN` *(optional)*
3. Deploy.

The app boots with an env check (`src/instrumentation.ts`); a missing required
var fails the deploy fast with a clear message.

## 4. Bootstrap the first staff member

Staff (operator/admin) gate the whole back office. There is no "first admin"
self-serve flow by design, so promote one by hand once:

1. Have the person **sign up** in the deployed app (creates their `auth.users`
   + `public.users` row).
2. In the SQL Editor, promote them:
   ```sql
   update public.users set staff_role = 'admin'
   where id = (select id from auth.users where email = 'you@datung.io');
   ```
3. They can now reach `/operator` and `/admin` and approve applicants.

## 5. Smoke test the pilot loop

1. Visit **`/health`** → both checks pass (env configured, Auth reachable).
2. **Buyer**: sign up → apply as buyer → operator approves with a credit limit.
3. **Seller**: apply as seller (gov ID + storefront photo/location + social
   proof) → operator approves (sets tier, reserve, exposure cap).
4. **Datung Pay**: seller "New sale" → QR/link → buyer opens `/pay/<token>` →
   picks a plan → authorizes. Seller page flips to **Approved**.
5. **Escrow → repay**: confirm receipt (or let the window auto-release) →
   record repayments until settled. After enough clean settlements the seller
   auto-graduates to `trusted`.
6. **Payout**: one staffer proposes a payout on **`/operator/payouts`**, a
   *different* staffer approves it (maker-checker).

## Operational notes

- **Backups**: enable Point-in-Time Recovery on the Supabase project before
  real users transact; test a restore once.
- **Config**: rates, fees, credit/exposure caps, reserve %, and the seller
  graduation threshold are all editable from **Operator → Config** (backed by
  `system_config`).
- **Ledger health**: the `ledger_imbalances` view should always be empty; wire
  it into a periodic check/alert.
- **Not yet wired** (fast-follows, not pilot-blocking): real payout rails,
  repayment idempotency keys, and forwarding `captureException` to Sentry.
- **Regulatory**: extending consumer credit in PH is regulated independently of
  this software (lending/financing registration, Truth-in-Lending-style
  disclosures, Data Privacy Act / NPC). Clear these before onboarding real
  borrowers.
