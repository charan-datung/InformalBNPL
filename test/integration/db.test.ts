import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Database integration tests. These run only when DATABASE_URL points at a
 * Postgres with all migrations + seed applied (the CI "db" job and the local
 * pg-harness both provide this). They assert the invariants the SQL layer is
 * responsible for: RLS everywhere, the atomic revolving-credit guard, the
 * ledger reconciliation view, and single-use payment-request claiming.
 */

const DB = process.env.DATABASE_URL;

describe.skipIf(!DB)("database invariants", () => {
  const client = new Client({ connectionString: DB });
  const buyer = randomUUID();
  const seller = randomUUID();
  const LIMIT = 300_000;

  beforeAll(async () => {
    await client.connect();
    // Hermetic fixtures: a verified+activated buyer with a small limit, and a
    // verified seller, so the guard tests don't depend on seed specifics.
    await client.query("insert into auth.users (id, email) values ($1,$2),($3,$4)", [
      buyer, `buyer+${buyer}@test.local`, seller, `seller+${seller}@test.local`,
    ]);
    // A trigger may auto-create public.users from auth.users; upsert to be safe.
    await client.query(
      `insert into public.users (id, name) values ($1,'Test Buyer'),($2,'Test Seller')
       on conflict (id) do nothing`,
      [buyer, seller],
    );
    await client.query(
      `insert into public.buyer_profiles (user_id, kyc_status, credit_limit_centavos, activated_at)
       values ($1, 'verified', $2, now())
       on conflict (user_id) do update
         set kyc_status = 'verified',
             credit_limit_centavos = excluded.credit_limit_centavos,
             activated_at = now()`,
      [buyer, LIMIT],
    );
    await client.query(
      `insert into public.seller_profiles (user_id, kyc_status, activated_at)
       values ($1, 'verified', now())
       on conflict (user_id) do update
         set kyc_status = 'verified', activated_at = now()`,
      [seller],
    );
  });

  afterAll(async () => {
    // Best-effort teardown. The test DB is ephemeral (CI service container /
    // local throwaway harness), and escrow_events is append-only (so the loans
    // created here can't be deleted), so cleanup failures are non-fatal.
    try {
      await client.query(
        "delete from public.payment_requests where seller_user_id=$1 or buyer_user_id=$2",
        [seller, buyer],
      );
    } catch {
      /* ignore — ephemeral DB */
    }
    await client.end();
  });

  it("has RLS enabled on every public table", async () => {
    const { rows } = await client.query(
      `select relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("rejects a booking above the available line (atomic guard)", async () => {
    await expect(
      client.query("select public.book_loan($1,$2,$3,3,0.035,5,null,'over')", [
        buyer, seller, LIMIT + 1,
      ]),
    ).rejects.toThrow(/exceeds available credit/);
  });

  it("revolves: fills the line, then rejects any further exposure", async () => {
    await client.query("select public.book_loan($1,$2,$3,3,0.035,5,null,'full')", [
      buyer, seller, LIMIT,
    ]);
    await expect(
      client.query("select public.book_loan($1,$2,1,3,0.035,5,null,'extra')", [
        buyer, seller,
      ]),
    ).rejects.toThrow(/exceeds available credit/);
  });

  it("surfaces an unbalanced transaction in ledger_imbalances", async () => {
    const ok = randomUUID();
    const bad = randomUUID();
    await client.query(
      `insert into public.ledger_entries (txn_id, account, direction, amount_centavos) values
        ($1,'buyer_receivable','debit',1000), ($1,'seller_payable','credit',1000),
        ($2,'buyer_receivable','debit',1000), ($2,'seller_payable','credit',999)`,
      [ok, bad],
    );
    const { rows } = await client.query(
      "select txn_id from public.ledger_imbalances where txn_id = any($1)",
      [[ok, bad]],
    );
    expect(rows.map((r) => r.txn_id)).toEqual([bad]); // balanced txn absent
    await client.query("delete from public.ledger_entries where txn_id = any($1)", [
      [ok, bad],
    ]);
  });

  it("claims a payment request exactly once (single-use CAS)", async () => {
    const token = randomUUID();
    await client.query(
      `insert into public.payment_requests
         (token, seller_user_id, amount_centavos, fulfillment, expires_at)
       values ($1,$2,1000,'in_person', now() + interval '30 min')`,
      [token, seller],
    );
    const claim = () =>
      client.query(
        `update public.payment_requests set status='authorized', buyer_user_id=$2
           where token=$1 and status='pending' returning id`,
        [token, buyer],
      );
    const first = await claim();
    const second = await claim();
    expect(first.rowCount).toBe(1);
    expect(second.rowCount).toBe(0); // already claimed
  });

  // Fresh buyer (high limit) + seller (given cap/tier) so guard/graduation
  // tests are isolated from the shared fixture's exposure.
  async function makeParty(sellerCap: number, tier = "new") {
    const b = randomUUID();
    const s = randomUUID();
    await client.query("insert into auth.users (id,email) values ($1,$2),($3,$4)", [
      b, `b+${b}@test.local`, s, `s+${s}@test.local`,
    ]);
    await client.query(
      "insert into public.users (id,name) values ($1,'B'),($2,'S') on conflict (id) do nothing",
      [b, s],
    );
    await client.query(
      `insert into public.buyer_profiles (user_id, kyc_status, credit_limit_centavos, activated_at)
       values ($1,'verified',10000000, now())
       on conflict (user_id) do update set credit_limit_centavos=10000000, kyc_status='verified', activated_at=now()`,
      [b],
    );
    await client.query(
      `insert into public.seller_profiles (user_id, kyc_status, trust_tier, activated_at, max_outstanding_centavos, rolling_reserve_pct)
       values ($1,'verified',$2, now(), $3, 10)
       on conflict (user_id) do update set trust_tier=$2, max_outstanding_centavos=$3, rolling_reserve_pct=10`,
      [s, tier, sellerCap],
    );
    return { b, s };
  }

  it("rejects a booking above the seller exposure cap", async () => {
    const { b, s } = await makeParty(200_000);
    await expect(
      client.query("select public.book_loan($1,$2,200001,3,0.035,5,null,'x')", [b, s]),
    ).rejects.toThrow(/exceeds seller exposure cap/);
  });

  it("auto-graduates a new seller after enough settled fulfilments", async () => {
    const { b, s } = await makeParty(500_000, "new");
    await client.query(
      "update public.system_config set value='2' where key='seller_graduation_threshold'",
    );
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const r = await client.query(
        "select (public.book_loan($1,$2,50000,3,0.035,5,null,'g')).id as id",
        [b, s],
      );
      ids.push(r.rows[0].id);
    }
    let { rows } = await client.query(
      "select trust_tier from public.seller_profiles where user_id=$1",
      [s],
    );
    expect(rows[0].trust_tier).toBe("new"); // not yet

    await client.query("update public.loans set status='settled' where id = any($1)", [ids]);
    ({ rows } = await client.query(
      "select trust_tier, max_outstanding_centavos from public.seller_profiles where user_id=$1",
      [s],
    ));
    expect(rows[0].trust_tier).toBe("trusted");
    expect(Number(rows[0].max_outstanding_centavos)).toBe(5_000_000);
  });

  it("maker-checker payout: approves (balanced), blocks self-approval & double-pay", async () => {
    const { b, s } = await makeParty(5_000_000);
    const maker = randomUUID();
    const checker = randomUUID();
    await client.query("insert into auth.users (id,email) values ($1,$2),($3,$4)", [
      maker, `mk+${maker}@t`, checker, `ck+${checker}@t`,
    ]);
    await client.query(
      "insert into public.users (id,name,staff_role) values ($1,'Mk','operator'),($2,'Ck','operator') on conflict (id) do nothing",
      [maker, checker],
    );

    // Book + release a loan, post one balanced disbursement (payable 85,000).
    const loanId = (
      await client.query(
        "select (public.book_loan($1,$2,100000,3,0.035,5,null,'x')).id as id",
        [b, s],
      )
    ).rows[0].id;
    const txn = randomUUID();
    await client.query(
      `insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos) values
        ($1,$2,'buyer_receivable','debit',100000), ($1,$2,'seller_payable','credit',85000),
        ($1,$2,'merchant_fee_income','credit',5000), ($1,$2,'seller_reserve','credit',10000)`,
      [txn, loanId],
    );
    await client.query("update public.loans set status='escrow_released' where id=$1", [loanId]);

    const payoutId = (
      await client.query(
        "insert into public.payouts (seller_user_id, amount_centavos, maker_user_id) values ($1,85000,$2) returning id",
        [s, maker],
      )
    ).rows[0].id;

    // Maker cannot approve their own proposal.
    await expect(
      client.query("select public.approve_payout($1,$2)", [payoutId, maker]),
    ).rejects.toThrow(/Maker cannot approve/);

    // A different checker can.
    await client.query("select public.approve_payout($1,$2)", [payoutId, checker]);
    const status = (
      await client.query("select status from public.payouts where id=$1", [payoutId])
    ).rows[0].status;
    expect(status).toBe("approved");

    // Ledger stays balanced (disbursement + settlement txns both net zero).
    const imb = (
      await client.query("select count(*)::int as n from public.ledger_imbalances")
    ).rows[0].n;
    expect(imb).toBe(0);

    // Nothing left to pay out → a second payout is rejected.
    const p2 = (
      await client.query(
        "insert into public.payouts (seller_user_id, amount_centavos, maker_user_id) values ($1,1,$2) returning id",
        [s, maker],
      )
    ).rows[0].id;
    await expect(
      client.query("select public.approve_payout($1,$2)", [p2, checker]),
    ).rejects.toThrow(/exceeds available payable/);
  });

  it("repayments draw down buyer_receivable and recognize interest (balanced)", async () => {
    const { b, s } = await makeParty(5_000_000);
    const loanId = (
      await client.query(
        "select (public.book_loan($1,$2,100000,3,0.035,5,null,'x')).id as id",
        [b, s],
      )
    ).rows[0].id;

    // Disbursement debits buyer_receivable for the principal (₱1,000).
    const dt = randomUUID();
    await client.query(
      `insert into public.ledger_entries (txn_id, loan_id, account, direction, amount_centavos) values
        ($1,$2,'buyer_receivable','debit',100000), ($1,$2,'seller_payable','credit',95000),
        ($1,$2,'merchant_fee_income','credit',5000)`,
      [dt, loanId],
    );

    await client.query("update public.loans set status='escrow_released' where id=$1", [loanId]);
    await client.query("select public.start_repayment($1,'escrow_released',null)", [loanId]);

    const ids = (
      await client.query("select id from public.repayments where loan_id=$1 order by due_date", [
        loanId,
      ])
    ).rows.map((r) => r.id);
    for (const id of ids) {
      await client.query("select public.record_repayment($1,null)", [id]);
    }

    // Receivable fully drawn down; interest recognized; ledger balanced.
    const receivable = (
      await client.query(
        `select coalesce(sum(case when direction='debit' then amount_centavos else -amount_centavos end),0)::int as n
           from public.ledger_entries where account='buyer_receivable' and loan_id=$1`,
        [loanId],
      )
    ).rows[0].n;
    expect(receivable).toBe(0);

    const interest = (
      await client.query(
        "select coalesce(sum(amount_centavos),0)::int as n from public.ledger_entries where account='interest_income' and loan_id=$1",
        [loanId],
      )
    ).rows[0].n;
    expect(interest).toBe(10_500);

    const imb = (
      await client.query("select count(*)::int as n from public.ledger_imbalances")
    ).rows[0].n;
    expect(imb).toBe(0);

    const status = (
      await client.query("select status from public.loans where id=$1", [loanId])
    ).rows[0].status;
    expect(status).toBe("settled");
  });
});
