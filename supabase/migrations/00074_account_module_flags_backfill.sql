-- 00074_account_module_flags_backfill.sql
-- Sensible defaults for existing rows after 00072 (module flags defaulted false).
-- New orgs still get explicit flags from templates; this avoids empty pickers.

-- AP / bills / supplier defaults: expense lines
update public.accounts
   set available_in_invoices = true
 where type = 'expense'
   and coalesce(available_in_invoices, false) = false;

-- Trade creditors (typical subtype from starter chart)
update public.accounts
   set available_in_invoices = true
 where type = 'liability'
   and subtype = 'Payable'
   and coalesce(available_in_invoices, false) = false;

-- Donations / giving income selectors
update public.accounts
   set available_in_donations = true
 where type = 'income'
   and coalesce(available_in_donations, false) = false;

-- Payroll mapping (starter chart uses subtype Staff / Payroll Liability)
update public.accounts
   set available_in_payroll = true
 where coalesce(available_in_payroll, false) = false
   and (
     subtype = 'Staff'
     or subtype = 'Payroll Liability'
   );

-- Platform / card fees for giving integrations (expense, finance-related lines)
update public.accounts
   set available_in_donations = true
 where type = 'expense'
   and coalesce(available_in_donations, false) = false
   and (
     reporting_category in ('Finance Costs', 'Support Costs')
     or code in ('EXP-010', 'EXP-011', 'EXP-012')
   );
