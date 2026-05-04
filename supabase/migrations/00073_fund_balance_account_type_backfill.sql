-- 00073_fund_balance_account_type_backfill.sql
-- Separate migration so enum value fund_balance (added in 00072) can be
-- assigned (PG forbids ADD VALUE + use in same tx).

update public.accounts
   set type = 'fund_balance'::public.account_type
 where type = 'equity'::public.account_type;

update public.accounts
   set normal_balance = 'credit'
 where normal_balance is null
   and type::text = 'fund_balance';
