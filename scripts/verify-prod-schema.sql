-- Run this in the Supabase SQL Editor against your PRODUCTION project to confirm
-- the schema is in sync with the repo before deploying. Every row should report
-- 'OK'. Anything 'MISSING' means a migration hasn't been applied there.

-- 1. Core tables exist
select 'tables' as check,
       case when count(*) = 7 then 'OK' else 'MISSING ('||count(*)||'/7)' end as status,
       string_agg(table_name, ', ') as found
from information_schema.tables
where table_schema = 'public'
  and table_name in ('users','buyer_profiles','seller_profiles','loans',
                     'disputes','repayments','system_config');

-- 2. Latest feature columns (seller OCR — migration 20260624000000)
select 'seller ocr columns' as check,
       case when count(*) = 2 then 'OK' else 'MISSING — apply 20260624000000_seller_ocr.sql' end as status,
       string_agg(column_name, ', ') as found
from information_schema.columns
where table_schema = 'public' and table_name = 'seller_profiles'
  and column_name in ('ocr_id_text','ocr_storefront_text');

-- 3. Underwriting columns the Members page reads
select 'underwriting columns' as check,
       case when count(*) = 3 then 'OK' else 'MISSING' end as status,
       string_agg(table_name||'.'||column_name, ', ') as found
from information_schema.columns
where table_schema = 'public'
  and ((table_name='buyer_profiles'  and column_name='credit_limit_centavos')
    or (table_name='seller_profiles' and column_name in ('trust_tier','max_outstanding_centavos')));

-- 4. Storage buckets exist
select 'storage buckets' as check,
       case when count(*) = 2 then 'OK' else 'MISSING — buckets not created' end as status,
       string_agg(id, ', ') as found
from storage.buckets
where id in ('buyer-id','seller-verification');

-- 5. Auto-release cron job scheduled (needs pg_cron extension enabled)
select 'pg_cron extension' as check,
       case when exists (select 1 from pg_extension where extname='pg_cron')
            then 'OK' else 'MISSING — enable pg_cron in Database > Extensions' end as status;

-- 6. At least one staff user (so you can log into /operator)
select 'staff user' as check,
       case when count(*) > 0 then 'OK ('||count(*)||')' else 'MISSING — no staff_role set' end as status
from public.users
where staff_role is not null;
