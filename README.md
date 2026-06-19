# Informal BNPL — Pilot

A pilot Progressive Web App (PWA) for a buy-now-pay-later (BNPL) lending
operation in the Philippines. **This is a pilot to learn, not production.**

## Hard rules

These hold everywhere in the codebase:

- **The app never moves real money.** It records loan and escrow **state**
  only. A human operator executes actual transfers outside the app.
- **Currency is PHP, stored as integers in centavos** (₱1.00 = `100`). Never
  use floats for money.
- **Simple, readable code. No premature abstraction.** Each step is tested
  before continuing.

## Stack

- **Next.js** (App Router, TypeScript) — `next@16`, React 19
- **Tailwind CSS v4**
- **Supabase** — Postgres + Auth (email/password) + Storage
- Deploys to **Vercel**

## The four surfaces

The app is split into four surfaces, organized with App Router
[route groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups)
so each can have its own layout without affecting the URL:

| Surface             | Route group   | URL(s)      | Who                                                                 |
| ------------------- | ------------- | ----------- | ------------------------------------------------------------------- |
| Buyer + Seller      | `(public)`    | `/`         | Public PWA. One account can be **both** buyer and seller.           |
| Operator console    | `(operator)`  | `/operator` | Internal staff: daily transaction / escrow / dispute workflow.      |
| Admin portal        | `(admin)`     | `/admin`    | Internal, highest privilege: system params, staff, audit, override. |
| Health check        | —             | `/health`   | Liveness + Supabase connectivity check.                             |

> Buyer and seller live in **one** route group because a single user identity
> can hold both capabilities.

## Folder structure

```
src/
  proxy.ts                      # Refreshes the Supabase auth session per request (Next 16 proxy)
  app/
    layout.tsx                  # Root layout (fonts, metadata, PWA manifest)
    globals.css                 # Tailwind entry + theme tokens
    health/
      page.tsx                  # /health — app + Supabase status
    (public)/                   # Buyer + Seller PWA
      layout.tsx
      page.tsx                  # /
    (operator)/                 # Operator console
      layout.tsx
      operator/page.tsx         # /operator
    (admin)/                    # Admin portal
      layout.tsx
      admin/page.tsx            # /admin
  lib/
    supabase/
      client.ts                 # Browser client (Client Components)
      server.ts                 # Server client (Server Components / Actions / Routes)
      middleware.ts             # updateSession() helper used by src/proxy.ts
public/
  manifest.webmanifest          # PWA manifest
```

Nothing functional is built yet — these are placeholders that establish the
structure.

## Auth

Supabase Auth (email/password) is wired up at the infrastructure level using
[`@supabase/ssr`](https://supabase.com/docs/guides/auth/server-side/nextjs):

- `src/lib/supabase/client.ts` — for Client Components (browser).
- `src/lib/supabase/server.ts` — for Server Components, Route Handlers, and
  Server Actions; reads/writes the session via cookies.
- `src/proxy.ts` — refreshes the session on every request (Next 16 `proxy`
  convention, formerly `middleware`).

No sign-in/sign-up screens or route protection exist yet. Per-surface access
control (operator / admin gating) comes once staff roles are defined.

## Running locally

### 1. Prerequisites

- Node.js 20+ (built with Node 22)
- A Supabase project (free tier is fine) — https://supabase.com

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in the two values from your Supabase project
(**Project Settings → API**):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3. Enable email/password auth in Supabase

In the Supabase dashboard: **Authentication → Sign In / Providers → Email**,
and enable the Email provider. (For the pilot you may also turn off email
confirmation to make testing faster.)

### 4. Install and run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### 5. Verify

Visit **http://localhost:3000/health**. With env configured correctly you
should see:

- `Supabase env configured` → pass
- `Supabase Auth reachable` → pass

If the env vars are missing the page reports `degraded` rather than crashing.

## Scripts

| Command         | What it does                          |
| --------------- | ------------------------------------- |
| `npm run dev`   | Start the dev server (localhost:3000) |
| `npm run build` | Production build                      |
| `npm run start` | Run the production build              |
| `npm run lint`  | ESLint                                |

## Database

The Postgres schema lives in `supabase/`:

```
supabase/
  migrations/20260618120000_init_schema.sql   # tables, enums, triggers, RLS
  seed.sql                                     # 1 admin, 1 operator, 3 users
```

### Tables

| Table              | Purpose                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `users`            | One row per identity, mirrored from `auth.users`. `staff_role` null = normal user. |
| `buyer_profiles`   | Buyer capability (KYC, credit limit). At most one per user.             |
| `seller_profiles`  | Seller capability (KYC, trust tier, rolling reserve). At most one per user. |
| `loans`            | A BNPL transaction; `status` is the live state-machine position.        |
| `escrow_events`    | Append-only audit log of everything that happens to a loan (never edited/deleted). |
| `repayments`       | The buyer's installment schedule for a loan.                            |
| `disputes`         | Disputes raised against a loan, plus their resolution.                  |
| `system_config`    | Admin-editable parameters (`value` is jsonb). Overrides code defaults.  |

A user may have a buyer profile, a seller profile, **both, or neither** —
capabilities unlock independently under one identity.

### Loan state machine

Transitions are enforced in code by `src/lib/loans/state-machine.ts` (the
`loan_status` enum only constrains values, not transitions):

```
booked → escrow_held → shipped → (delivered_confirmed | auto_released
                                  | dispute_raised) → escrow_released
       → repaying → settled

side states:  refunded (terminal) · frozen_fraud_review (hold)
```

Call `assertTransition(from, to)` before persisting any status change.

### System config

`src/lib/config/system-config.ts` reads `system_config` with code-defined
fallback defaults (`CONFIG_DEFAULTS`), so reads never fail on a missing key.
Keys there must stay in sync with the rows in `seed.sql`.

### Applying the schema locally

With the [Supabase CLI](https://supabase.com/docs/guides/local-development):

```bash
supabase start          # local stack
supabase db reset       # runs migrations/ then seed.sql
```

Or paste `migrations/…sql` then `seed.sql` into the SQL editor of a hosted
project. The seed inserts into `auth.users` (works locally / self-hosted); on
hosted Supabase, create the users via the dashboard instead and run only the
profile + config sections with the real UUIDs.

**Seed accounts** (all share password `password123`):

| Email                | Role     | Capabilities    |
| -------------------- | -------- | --------------- |
| `admin@bnpl.test`    | admin    | neither         |
| `operator@bnpl.test` | operator | neither         |
| `buyer@bnpl.test`    | normal   | buyer           |
| `seller@bnpl.test`   | normal   | seller          |
| `both@bnpl.test`     | normal   | buyer + seller  |

### Reads vs. writes (RLS)

Row Level Security is enabled on every table. Logged-in clients get **read**
access scoped to their own data; staff (operator/admin) read everything. No
client write policies exist — all **mutations** run server-side via the
service role (which bypasses RLS), where the state-machine validator enforces
correctness.

## Server-side mutations

All loan state changes flow through one trusted path. Nothing on the client
writes loan state directly.

```
operator UI ─▶ server action ─▶ mutations core ─▶ Postgres RPC
 (pending)     (auth-gated)      (validates)       (atomic write)
```

| Layer | File | Responsibility |
| --- | --- | --- |
| Server actions | `src/app/(operator)/operator/actions.ts` | `requireStaff()`, stamp the actor, delegate. |
| Mutations core | `src/lib/loans/mutations.ts` | `bookLoan` / `transitionLoan`. Runs business rules + the state-machine validator using the **service-role** client. |
| RPCs | `supabase/migrations/…loan_mutations.sql` | `book_loan` / `apply_loan_transition` — write the loan row **and** its `escrow_events` audit row in one transaction. |

Key properties:

- **Single source of transition truth.** `transitionLoan` reads the current
  status, calls `assertTransition(from, to)` (throws on an illegal jump), then
  applies it. The database does **not** re-decide legality.
- **Atomic + race-safe.** `apply_loan_transition` does a compare-and-swap on the
  expected from-status (`update … where status = p_from`). If the loan moved
  under us it writes nothing and raises `23514`, surfaced as a `conflict`.
- **Capability + credit checks.** `bookLoan` requires the buyer/seller to have
  activated, KYC-verified profiles and the ticket to fit the buyer's credit
  limit; missing rate/fee fall back to `system_config` defaults.
- **Service-role only.** The RPCs are revoked from `anon`/`authenticated` and
  granted to `service_role`; the admin client (`src/lib/supabase/admin.ts`)
  needs `SUPABASE_SERVICE_ROLE_KEY`.

### Try it (no login required)

A **dev-only** route handler drives the full path against the seed users —
book a loan, walk it `booked → … → settled`, and prove an illegal transition is
rejected. It returns 404 in production.

```bash
# with the dev server running and the schema + seed applied:
curl -X POST http://localhost:3000/api/dev/exercise-loan
```

Expected: a `trace` ending in `settled`, plus a `rejectedIllegalTransition`
showing `settled -> shipped` was refused by the validator.

## Deploying to Vercel

1. Import the repo into Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as
   environment variables.
3. Deploy. (No build configuration needed — Vercel detects Next.js.)
