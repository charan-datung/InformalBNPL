-- =============================================================================
-- Datung Pay — seller-initiated payment requests + double-entry ledger (0012)
--
-- The merchant's phone is the terminal: a seller mints a tokenized, amount-
-- locked Payment Request and shares it as a QR or an exclusive link. A pre-
-- approved buyer opens it, picks a plan, and authorizes against their REVOLVING
-- credit line — booking a loan instantly (no checkout-time underwriting).
--
-- Every authorization also posts a balanced (double-entry) ledger transaction
-- so the seller-payout obligation is recorded now and settled via rails later.
-- =============================================================================

-- ---- Payment requests (the "Charge" primitive) ------------------------------
create table if not exists public.payment_requests (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,
  seller_user_id  uuid not null references public.users (id),
  amount_centavos bigint not null check (amount_centavos > 0),
  memo            text,
  -- in_person: goods handed over at the stall; ship: escrow until delivered.
  fulfillment     text not null default 'in_person'
                    check (fulfillment in ('in_person', 'ship')),
  status          text not null default 'pending'
                    check (status in ('pending', 'authorized', 'expired', 'cancelled')),
  buyer_user_id   uuid references public.users (id),
  loan_id         uuid references public.loans (id),
  expires_at      timestamptz not null,
  authorized_at   timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists payment_requests_seller_idx
  on public.payment_requests (seller_user_id, created_at desc);

-- All access is server-side via the service role; deny everyone else.
alter table public.payment_requests enable row level security;

-- ---- Double-entry ledger ----------------------------------------------------
-- Each business event is one txn_id whose debits and credits sum equal (the
-- app asserts the balance before insert). Accounts:
--   buyer_receivable    (asset)     — principal the buyer owes us
--   seller_payable      (liability) — net amount we owe the seller
--   merchant_fee_income (income)    — our fee on the sale
create table if not exists public.ledger_entries (
  id              uuid primary key default gen_random_uuid(),
  txn_id          uuid not null,
  loan_id         uuid references public.loans (id),
  account         text not null,
  direction       text not null check (direction in ('debit', 'credit')),
  amount_centavos bigint not null check (amount_centavos > 0),
  memo            text,
  created_at      timestamptz not null default now()
);

create index if not exists ledger_entries_txn_idx on public.ledger_entries (txn_id);
create index if not exists ledger_entries_loan_idx on public.ledger_entries (loan_id);
create index if not exists ledger_entries_account_idx on public.ledger_entries (account);

alter table public.ledger_entries enable row level security;
