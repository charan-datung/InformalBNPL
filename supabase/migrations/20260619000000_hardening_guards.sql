-- =============================================================================
-- Hardening: atomic revolving-credit guard, ledger reconciliation, policies (0013)
--
-- 1. book_loan now enforces the revolving line INSIDE the transaction, taking a
--    row lock on the buyer's profile so concurrent bookings for the same buyer
--    serialize. This removes the check-then-act race that existed when the only
--    limit check lived in application code.
-- 2. A ledger_imbalances view surfaces any transaction whose debits != credits
--    (there should never be one) for reconciliation/alerting.
-- 3. Staff/owner read policies on payment_requests and ledger_entries, matching
--    the rest of the schema (they were RLS-locked with no policies).
-- =============================================================================

-- ---- 1. Atomic revolving-credit guard in book_loan --------------------------
create or replace function public.book_loan(
  p_buyer                 uuid,
  p_seller                uuid,
  p_ticket_centavos       bigint,
  p_tenor_months          int,
  p_interest_rate_monthly numeric,
  p_merchant_fee_pct      numeric,
  p_actor                 uuid default null,
  p_note                  text default null
)
returns public.loans
language plpgsql
as $$
declare
  v_loan        public.loans;
  v_limit       bigint;
  v_outstanding bigint;
begin
  -- Lock the buyer's profile row so two concurrent bookings for the same buyer
  -- can't both pass the available-credit check (check-then-act race).
  select credit_limit_centavos into v_limit
    from public.buyer_profiles
    where user_id = p_buyer
    for update;

  if v_limit is null then
    raise exception 'Buyer has no buyer profile' using errcode = 'check_violation';
  end if;

  -- Outstanding exposure = every loan that hasn't settled or refunded. After
  -- the FOR UPDATE lock above, this sum reflects all committed bookings.
  select coalesce(sum(ticket_centavos), 0) into v_outstanding
    from public.loans
    where buyer_user_id = p_buyer
      and status not in ('settled', 'refunded');

  if p_ticket_centavos > (v_limit - v_outstanding) then
    raise exception
      'Ticket % exceeds available credit (limit %, outstanding %)',
      p_ticket_centavos, v_limit, v_outstanding
      using errcode = 'check_violation';
  end if;

  insert into public.loans (
    buyer_user_id, seller_user_id, ticket_centavos, tenor_months,
    interest_rate_monthly, merchant_fee_pct, status
  )
  values (
    p_buyer, p_seller, p_ticket_centavos, p_tenor_months,
    p_interest_rate_monthly, p_merchant_fee_pct, 'booked'
  )
  returning * into v_loan;

  insert into public.escrow_events
    (loan_id, event_type, amount_centavos, note, actor_user_id)
  values
    (v_loan.id, 'booked', p_ticket_centavos, coalesce(p_note, 'Loan booked'), p_actor);

  return v_loan;
end;
$$;

-- Keep the existing execute grants (book_loan was revoked from public in 0002).
revoke execute on function
  public.book_loan(uuid, uuid, bigint, int, numeric, numeric, uuid, text)
  from public;

-- ---- 2. Ledger reconciliation view ------------------------------------------
-- security_invoker so RLS on ledger_entries still applies to whoever queries it.
create or replace view public.ledger_imbalances
  with (security_invoker = true)
as
select
  txn_id,
  sum(case when direction = 'debit'  then amount_centavos else 0 end) as debits,
  sum(case when direction = 'credit' then amount_centavos else 0 end) as credits
from public.ledger_entries
group by txn_id
having sum(case when direction = 'debit'  then amount_centavos else 0 end)
    <> sum(case when direction = 'credit' then amount_centavos else 0 end);

-- ---- 3. Read policies on the Datung Pay tables ------------------------------
create policy payment_requests_select on public.payment_requests
  for select to authenticated
  using (
    public.is_staff()
    or seller_user_id = auth.uid()
    or buyer_user_id = auth.uid()
  );

create policy ledger_entries_select on public.ledger_entries
  for select to authenticated
  using (public.is_staff());
