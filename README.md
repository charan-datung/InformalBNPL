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

## Public user journey

One identity, one login. Buyer and seller are **capabilities** unlocked
independently, each with its own approval status — never separate accounts.

```
/signup ─▶ /onboarding ─┬─ /onboarding/buyer  ─▶ buyer_profile  (pending)
 (Stage 1)  (Stage 2)    ├─ /onboarding/seller ─▶ seller_profile (pending)
                         └─ Both: buyer ▶ seller
                                              │
                              operator approves (manual)
                                              ▼
                          /dashboard (Stage 4): approved panel(s)
                          + Buy/Sell toggle when both are approved
                          + "add the other capability" anytime
```

| Stage | Route | What happens |
| --- | --- | --- |
| 1 — Signup | `/signup` | Email/phone + password via Supabase Auth. The `handle_new_user` trigger creates the `users` row with `staff_role` null. **No role, no underwriting yet.** |
| 2 — Role selection | `/onboarding` | Neutral "What would you like to do?" — Buy / Sell / Both. Not exclusive. |
| 3 — Onboarding | `/onboarding/buyer`, `/onboarding/seller` | **Underwriting starts here.** Buyer application or seller verification (with a required live item photo → private Storage). Creates the profile with `kyc_status 'pending'`. |
| 4 — Dashboard | `/dashboard` | Approved capability panels. A both-approved user gets a Buy/Sell mode toggle. Pending shows "under review"; missing capabilities show an "add it" path. |

Once a buyer is approved, the **buyer dashboard is live**: pick a verified
seller, enter an amount + tenor, and request a purchase — this books a loan
(state `booked`) that appears in the operator's loan queue. After the operator
holds escrow, the **seller marks the item shipped** from their dashboard; the
buyer can then **confirm delivery** or **raise a dispute** (with an optional
evidence photo → private bucket), which opens a dispute in the operator queue.
So the operator queues fill from real user actions: signups → review queues,
purchases → loans, disputes → dispute queue.

End to end, the loan walks:

```
buyer books → operator holds escrow → SELLER marks shipped →
  buyer confirms delivery (or disputes) → operator releases escrow
  (records merchant fee + net) → operator starts repayment
  (generates the installment schedule) → operator records each
  repayment → loan auto-settles when the last one is recorded
```

### Active dashboards

Once approved, each capability gets a working dashboard (with a Buy/Sell toggle
for dual-capability identities):

- **Buyer**: a **checkout** that previews the full repayment schedule
  (principal + interest + due dates) live as the amount/tenor change — using the
  same math as the server, so the preview matches what's generated later —
  before confirming (which books the loan and immediately holds escrow). An
  **impossible-to-miss "You owe" banner**, active loans with their schedule, and
  on shipped items a positive **"Confirm receipt — all good"** plus a
  **"Report a problem within the window"** path (required photo + description).
- **Seller**: each order leads with a **payout tracker** (Held → Shipped →
  Delivered → Paying out) showing the net-of-fee amount and the
  committed/estimated payout date, so a seller always sees where their money is.
  **"Mark as shipped"** requires a proof-of-shipment photo (private bucket;
  operators view it via a signed URL on the loan detail page).

Tenor default, interest rate, merchant fee, dispute window, and seller payout
window all come from `system_config`.

Repayment schedule = principal + flat monthly interest on principal
(`monthly_interest = round(ticket × interest_rate_monthly)`,
`total = ticket + monthly_interest × tenor`), split into `tenor` equal
installments with the last absorbing the rounding remainder. Generated once,
atomically, when the loan enters `repaying`; recording the final installment
auto-transitions the loan to `settled`.

Routing is centralized in `src/lib/profiles/capabilities.ts` (`getCapabilities`):
the home page, onboarding, and dashboard all branch off the buyer/seller
`kyc_status`. Approval itself is **manual** — an operator flips `kyc_status` to
`verified` (and sets `activated_at`); there is no automated decision.

The seller live photo is uploaded through a server action to a **private**
`seller-verification` Storage bucket (created by migration 0003); only
server-side code (service role) reads it. This needs `SUPABASE_SERVICE_ROLE_KEY`
set, and the server-action body limit is raised to 10 MB in `next.config.ts` for
camera images.

## Operator console

Staff-only surface (`staff_role` operator **or** admin) where a human runs the
whole pilot. Gated in `src/app/(operator)/layout.tsx` — non-staff are redirected
to `/login`. Reads use the service-role client (the surface is already gated);
every write is an auth-gated server action that stamps the actor server-side.

| Route | What it does |
| --- | --- |
| `/operator` | Overview: pending/open counts + the live `system_config` values used as defaults. |
| `/operator/loans` | All loans, color-coded by status. |
| `/operator/loans/[id]` | Full append-only `escrow_events` audit trail; **only valid transitions are enabled** (invalid ones are rendered disabled, driven by `state-machine.ts`); escrow release shows the net-to-seller. |
| `/operator/reviews/buyers` | Pending buyer applications → approve/reject + set `credit_limit_centavos` + notes. |
| `/operator/reviews/sellers` | Pending sellers with the live item photo (signed URL) → approve/reject + set `trust_tier` + reserve % + notes. |
| `/operator/disputes` | Open disputes with evidence → resolve for buyer (refund) or seller (release escrow). |
| `/operator/config` | View all `system_config` values; **admin-only** edits, each logged to the audit log. |
| `/operator/audit` | Unified audit log (profile approvals, config changes, dispute decisions). |

### Two audit trails

- **`escrow_events`** — the loan lifecycle (every status change + money line),
  per loan, shown on the loan detail page.
- **`audit_log`** — staff actions that aren't loan-scoped: buyer/seller
  approvals and rejections, `system_config` edits, and dispute decisions. Both
  tables are append-only (DB trigger blocks update/delete).

Properties:

- **Valid transitions only.** Buttons come from `LOAN_STATUSES`; each is enabled
  iff `canTransition(current, target)`. The action re-validates server-side, so a
  disabled/forged button still can't make an illegal jump.
- **Escrow release records the fee.** Choosing "Release escrow" calls the
  `release_escrow` RPC, which writes the gross `escrow_released` event **and** a
  `merchant_fee_deducted` event, then returns the net to pay the seller. The fee
  % is the per-loan value (sourced from `system_config` at booking).
- **Append-only, actor-stamped.** Every loan state change writes an
  `escrow_events` row with the actor's user id and a timestamp; nothing is
  deleted (DB trigger enforces it).
- **No hardcoded params.** Interest rate, merchant fee, reserve %, dispute
  window, and default credit limit are read from `system_config` (see the
  overview page and the prefilled review forms).

## Admin portal

Admin-only surface (`/admin/*`), higher privilege than the operator console:

| Route | What it does |
| --- | --- |
| `/admin/config` | Edit every `system_config` value; each change is audit-logged with who/when (and `updated_by`). |
| `/admin/staff` | View all users; promote/demote `staff_role` (user / operator / admin). You can't change your own role. |
| `/admin/audit` | Searchable, merged immutable trail — every `escrow_event` + every `audit_log` entry — filterable by user, loan, type, and date. |
| `/admin/loans`, `/admin/loans/[id]` | Read everything operators see, plus **override**. |

**Override**: an admin can force a loan into any status, bypassing the state
machine, but only with a **mandatory reason**. The force is recorded as a
flagged, immutable `admin_override` escrow_event (and mirrored to `audit_log`).
Overrides are visually flagged everywhere they appear — a red `OVERRIDE` badge
in the loans lists, a banner + highlighted rows on the loan detail, and a red
row in the audit search.

Admins are also staff, so they retain full read/write access to the operator
console.

### How access control is enforced

Defence in depth across three layers — not just hidden buttons:

1. **Route layer.** `(admin)/layout.tsx` calls `requireAdminOrRedirect()` as its
   first `await`; non-admins are redirected (operators → `/operator`, others →
   `/login`). Each admin page repeats the guard as its own first `await`, so a
   non-admin's request never reaches the data fetches below it.
2. **Data/action layer.** Every admin server action (`updateConfigAction`,
   `updateStaffRoleAction`, `adminOverrideAction`) begins with `requireAdmin()`,
   which **throws** for non-admins. So a direct POST that skips the UI is
   rejected before any write — the gate is server-side, keyed off the session
   user's `staff_role`, not the client.
3. **Database layer.** RLS restricts what a logged-in client can read to their
   own rows (staff via `is_staff()`); the privileged reads/writes run through
   the service-role client only inside these already-gated server contexts. The
   `audit_log` and `escrow_events` tables are append-only at the DB (trigger),
   so the trail can't be edited or deleted by anyone — including admins.

`staff_role` is read server-side from `public.users` for the session user
(`getCurrentStaff`); the client never asserts its own role.

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
