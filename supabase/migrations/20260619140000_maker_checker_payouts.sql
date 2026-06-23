-- =============================================================================
-- Maker-checker seller payouts (migration 0015)
--
-- Closes the money loop without payment rails: a staff "maker" proposes paying
-- a seller their releasable balance; a DIFFERENT staff "checker" approves. On
-- approval we post the settlement leg in the double-entry ledger (debit
-- seller_payable, credit payout_clearing) — recording that the obligation is
-- discharged, to be paid over real rails later. The rolling reserve stays in
-- seller_reserve until separately released.
--
-- "Releasable" = the seller_payable credited for that seller's loans whose
-- escrow has released (escrow_released / repaying / settled), minus payouts
-- already approved.
-- =============================================================================

create table if not exists public.payouts (
  id              uuid primary key default gen_random_uuid(),
  seller_user_id  uuid not null references public.users (id),
  amount_centavos bigint not null check (amount_centavos > 0),
  status          text not null default 'proposed'
                    check (status in ('proposed', 'approved', 'rejected')),
  maker_user_id   uuid not null references public.users (id),
  checker_user_id uuid references public.users (id),
  note            text,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  -- Maker-checker separation of duties: the approver can't be the proposer.
  constraint checker_is_not_maker
    check (checker_user_id is null or checker_user_id <> maker_user_id)
);

create index if not exists payouts_seller_idx on public.payouts (seller_user_id, created_at desc);
create index if not exists payouts_status_idx on public.payouts (status);

-- Per-seller releasable seller_payable (escrow already released). Gross of
-- payouts (those debit seller_payable with no loan_id, so they don't appear in
-- this loan-joined sum); the app subtracts approved payouts to get "available".
create or replace view public.seller_releasable_payable
  with (security_invoker = true)
as
select
  l.seller_user_id,
  sum(case when e.direction = 'credit' then e.amount_centavos else -e.amount_centavos end)
    as releasable_centavos
from public.ledger_entries e
join public.loans l on l.id = e.loan_id
where e.account = 'seller_payable'
  and l.status in ('escrow_released', 'repaying', 'settled')
group by l.seller_user_id;

alter table public.payouts enable row level security;

create policy payouts_select on public.payouts
  for select to authenticated
  using (public.is_staff() or seller_user_id = auth.uid());

-- ---- Atomic approval: re-check availability + post the ledger settlement ----
create or replace function public.approve_payout(p_payout uuid, p_checker uuid)
returns void
language plpgsql
as $$
declare
  v            public.payouts;
  v_releasable bigint;
  v_paid_out   bigint;
  v_txn        uuid;
begin
  select * into v from public.payouts where id = p_payout for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'no_data_found';
  end if;
  if v.status <> 'proposed' then
    raise exception 'Payout already decided' using errcode = 'check_violation';
  end if;
  if v.maker_user_id = p_checker then
    raise exception 'Maker cannot approve their own payout' using errcode = 'check_violation';
  end if;

  -- Releasable seller_payable for this seller (escrow already released).
  select coalesce(sum(case when e.direction = 'credit'
                           then e.amount_centavos else -e.amount_centavos end), 0)
    into v_releasable
    from public.ledger_entries e
    join public.loans l on l.id = e.loan_id
    where e.account = 'seller_payable'
      and l.seller_user_id = v.seller_user_id
      and l.status in ('escrow_released', 'repaying', 'settled');

  select coalesce(sum(amount_centavos), 0) into v_paid_out
    from public.payouts
    where seller_user_id = v.seller_user_id and status = 'approved' and id <> p_payout;

  if v.amount_centavos > (v_releasable - v_paid_out) then
    raise exception 'Payout % exceeds available payable (releasable %, already paid %)',
      v.amount_centavos, v_releasable, v_paid_out
      using errcode = 'check_violation';
  end if;

  -- Balanced settlement: we owe the seller less; cash is staged for rails.
  v_txn := gen_random_uuid();
  insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos, memo) values
    (v_txn, null, 'seller_payable',  'debit',  v.amount_centavos, 'Seller payout settlement'),
    (v_txn, null, 'payout_clearing', 'credit', v.amount_centavos, 'Payout staged for rails');

  update public.payouts
     set status = 'approved', checker_user_id = p_checker, decided_at = now()
   where id = p_payout;
end;
$$;

revoke execute on function public.approve_payout(uuid, uuid) from public;
grant execute on function public.approve_payout(uuid, uuid) to service_role;
