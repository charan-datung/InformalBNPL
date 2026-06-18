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

## Deploying to Vercel

1. Import the repo into Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as
   environment variables.
3. Deploy. (No build configuration needed — Vercel detects Next.js.)
