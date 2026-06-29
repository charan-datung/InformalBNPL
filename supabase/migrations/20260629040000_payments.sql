-- =============================================================================
-- Buyer payment evidence + partial/overpayment allocation (migration 0024)
--
-- Until now an operator marked a whole installment "paid" with one click, no
-- evidence, no partials. This adds:
--   * payments — buyer-submitted payment reports (reference #, amount, method,
--     optional proof) that an operator confirms or rejects.
--   * repayments.paid_centavos — per-installment running paid amount, so a
--     payment can partially cover an installment.
--   * apply_payment(loan, amount) — allocates an amount across open installments
--     oldest-first, splits each into interest-first principal/interest, posts the
--     balanced buyer-side ledger leg, and auto-settles when nothing is open.
-- =============================================================================

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  loan_id         uuid not null references public.loans (id) on delete restrict,
  amount_centavos bigint not null check (amount_centavos > 0),
  reference_no    text,
  method          text,          -- gcash | maya | bank | other
  proof_path      text,
  status          text not null default 'reported',  -- reported | confirmed | rejected
  reported_by     uuid references public.users (id),
  confirmed_by    uuid references public.users (id),
  note            text,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz
);

create index if not exists payments_loan_idx on public.payments (loan_id);
create index if not exists payments_status_idx on public.payments (status, created_at);

alter table public.payments enable row level security;
-- Buyers may read their own payment reports; all writes go through the service
-- role (buyer submit + operator confirm both run server-side).
drop policy if exists payments_own_select on public.payments;
create policy payments_own_select on public.payments
  for select using (
    exists (
      select 1 from public.loans l
      where l.id = payments.loan_id and l.buyer_user_id = auth.uid()
    )
  );

alter table public.repayments
  add column if not exists paid_centavos bigint not null default 0;

-- Private bucket for optional payment screenshots (Supabase only; no-op on plain PG).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('payment-proof', 'payment-proof', false)
    on conflict (id) do nothing;
  end if;
end $$;

-- ---- record_repayment: keep paid_centavos consistent with the full mark ------
-- (Redefined so the quick "Record paid" path and apply_payment never disagree.)
create or replace function public.record_repayment(
  p_repayment_id uuid,
  p_actor        uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_loan_id   uuid;
  v_amount    bigint;
  v_principal bigint;
  v_interest  bigint;
  v_remaining int;
  v_txn       uuid;
begin
  update public.repayments
     set status = 'paid', paid_at = now(), paid_centavos = amount_centavos
   where id = p_repayment_id
     and status <> 'paid'
  returning loan_id, amount_centavos,
            coalesce(interest_centavos, 0),
            coalesce(principal_centavos, amount_centavos - coalesce(interest_centavos, 0))
    into v_loan_id, v_amount, v_interest, v_principal;

  if not found then
    raise exception 'repayment % not found or already paid', p_repayment_id
      using errcode = 'check_violation';
  end if;

  insert into public.escrow_events (loan_id, event_type, amount_centavos, note, actor_user_id)
  values (v_loan_id, 'repayment_recorded', v_amount, 'Repayment recorded', p_actor);

  if v_amount > 0 then
    v_txn := gen_random_uuid();
    insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos, memo)
    values (v_txn, v_loan_id, 'cash_clearing', 'debit', v_amount, 'Repayment received');
    if v_principal > 0 then
      insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos, memo)
      values (v_txn, v_loan_id, 'buyer_receivable', 'credit', v_principal, 'Principal repaid');
    end if;
    if v_interest > 0 then
      insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos, memo)
      values (v_txn, v_loan_id, 'interest_income', 'credit', v_interest, 'Interest earned');
    end if;
  end if;

  select count(*) into v_remaining
    from public.repayments
   where loan_id = v_loan_id and status not in ('paid', 'waived');

  if v_remaining = 0 then
    update public.loans set status = 'settled'
     where id = v_loan_id and status = 'repaying';
    if found then
      insert into public.escrow_events (loan_id, event_type, note, actor_user_id)
      values (v_loan_id, 'settled', 'All repayments recorded — loan settled', p_actor);
    end if;
  end if;

  return jsonb_build_object('loan_id', v_loan_id, 'remaining', v_remaining);
end;
$$;

-- ---- apply_payment: allocate an amount across open installments --------------
create or replace function public.apply_payment(
  p_loan_id    uuid,
  p_amount     bigint,
  p_actor      uuid default null,
  p_payment_id uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_remaining       bigint := p_amount;
  v_alloc           bigint := 0;
  v_principal_total bigint := 0;
  v_interest_total  bigint := 0;
  r                 record;
  v_due             bigint;
  v_apply           bigint;
  v_paid1           bigint;
  v_int0            bigint;
  v_int1            bigint;
  v_txn             uuid;
  v_open            int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  for r in
    select id, amount_centavos,
           coalesce(paid_centavos, 0)     as paid,
           coalesce(interest_centavos, 0) as interest
      from public.repayments
     where loan_id = p_loan_id
       and status <> 'waived'
       and coalesce(paid_centavos, 0) < amount_centavos
     order by due_date asc, id asc
  loop
    exit when v_remaining <= 0;
    v_due   := r.amount_centavos - r.paid;
    v_apply := least(v_remaining, v_due);
    v_paid1 := r.paid + v_apply;

    -- Interest-first split within this installment's newly-paid portion.
    v_int0 := least(r.paid, r.interest);
    v_int1 := least(v_paid1, r.interest);
    v_interest_total  := v_interest_total + (v_int1 - v_int0);
    v_principal_total := v_principal_total + (v_apply - (v_int1 - v_int0));

    update public.repayments
       set paid_centavos = v_paid1,
           status  = case when v_paid1 >= amount_centavos then 'paid' else status end,
           paid_at = case when v_paid1 >= amount_centavos then now() else paid_at end
     where id = r.id;

    v_alloc     := v_alloc + v_apply;
    v_remaining := v_remaining - v_apply;
  end loop;

  if v_alloc > 0 then
    v_txn := gen_random_uuid();
    insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos, memo)
    values (v_txn, p_loan_id, 'cash_clearing', 'debit', v_alloc, 'Payment received');
    if v_principal_total > 0 then
      insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos, memo)
      values (v_txn, p_loan_id, 'buyer_receivable', 'credit', v_principal_total, 'Principal repaid');
    end if;
    if v_interest_total > 0 then
      insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos, memo)
      values (v_txn, p_loan_id, 'interest_income', 'credit', v_interest_total, 'Interest earned');
    end if;
    insert into public.escrow_events (loan_id, event_type, amount_centavos, note, actor_user_id)
    values (p_loan_id, 'repayment_recorded', v_alloc,
            format('Payment applied: %s centavos', v_alloc), p_actor);
  end if;

  if p_payment_id is not null then
    update public.payments
       set status = 'confirmed', confirmed_by = p_actor, confirmed_at = now()
     where id = p_payment_id;
  end if;

  select count(*) into v_open
    from public.repayments
   where loan_id = p_loan_id and status not in ('paid', 'waived');

  if v_open = 0 then
    update public.loans set status = 'settled'
     where id = p_loan_id and status = 'repaying';
    if found then
      insert into public.escrow_events (loan_id, event_type, note, actor_user_id)
      values (p_loan_id, 'settled', 'All repayments recorded — loan settled', p_actor);
    end if;
  end if;

  return jsonb_build_object(
    'allocated_centavos', v_alloc,
    'excess_centavos', v_remaining,
    'open_installments', v_open
  );
end;
$$;

revoke execute on function public.record_repayment(uuid, uuid) from public;
revoke execute on function public.apply_payment(uuid, bigint, uuid, uuid) from public;
grant execute on function public.record_repayment(uuid, uuid) to service_role;
grant execute on function public.apply_payment(uuid, bigint, uuid, uuid) to service_role;
