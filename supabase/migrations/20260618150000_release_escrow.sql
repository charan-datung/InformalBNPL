-- =============================================================================
-- Informal BNPL pilot — escrow release with merchant fee (migration 0004)
--
-- When escrow is released, the operator owes the seller the ticket minus the
-- per-loan merchant fee. We record BOTH the gross release and the fee deduction
-- as separate append-only escrow_events rows, in one transaction, and return
-- the net so the console can show what to actually pay the seller.
--
-- The merchant fee percentage is the per-loan value captured at booking (which
-- itself came from system_config). Nothing is hardcoded here.
-- =============================================================================

-- New audit event type for the fee line. (ADD VALUE is safe in a migration; the
-- value is only referenced at runtime, not at function-create time.)
alter type escrow_event_type add value if not exists 'merchant_fee_deducted';

create or replace function public.release_escrow(
  p_loan_id uuid,
  p_from    loan_status,
  p_actor   uuid default null,
  p_note    text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_loan public.loans;
  v_fee  bigint;
  v_net  bigint;
begin
  -- Compare-and-swap to escrow_released (race-safe, same pattern as
  -- apply_loan_transition). The TS validator has already confirmed the
  -- current -> escrow_released transition is legal.
  update public.loans
     set status = 'escrow_released'
   where id = p_loan_id
     and status = p_from
  returning * into v_loan;

  if not found then
    raise exception
      'loan % is not in expected state % (concurrent change or wrong from-state)',
      p_loan_id, p_from
      using errcode = 'check_violation';
  end if;

  -- Gross release (full ticket held in escrow).
  insert into public.escrow_events (loan_id, event_type, amount_centavos, note, actor_user_id)
  values (p_loan_id, 'escrow_released', v_loan.ticket_centavos,
          coalesce(p_note, 'Escrow released (gross ticket)'), p_actor);

  -- Merchant fee deduction. Integer centavos throughout.
  v_fee := round(v_loan.ticket_centavos * v_loan.merchant_fee_pct / 100.0)::bigint;
  v_net := v_loan.ticket_centavos - v_fee;

  insert into public.escrow_events (loan_id, event_type, amount_centavos, note, actor_user_id)
  values (p_loan_id, 'merchant_fee_deducted', v_fee,
          format('Merchant fee %s%% withheld (%s centavos); net to seller %s centavos',
                 v_loan.merchant_fee_pct, v_fee, v_net),
          p_actor);

  return jsonb_build_object(
    'loan_id', p_loan_id,
    'gross_centavos', v_loan.ticket_centavos,
    'fee_centavos', v_fee,
    'net_centavos', v_net,
    'merchant_fee_pct', v_loan.merchant_fee_pct
  );
end;
$$;

revoke execute on function
  public.release_escrow(uuid, loan_status, uuid, text) from public;
grant execute on function
  public.release_escrow(uuid, loan_status, uuid, text) to service_role;
