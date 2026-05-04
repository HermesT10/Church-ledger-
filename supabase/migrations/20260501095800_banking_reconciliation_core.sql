alter table public.bank_lines
  add column if not exists additional_description text,
  add column if not exists display_description text;

alter table public.bank_import_mappings
  add column if not exists additional_description_column text;

update public.bank_lines
   set display_description = nullif(trim(coalesce(description, '') || case
       when nullif(trim(coalesce(additional_description, '')), '') is not null
         and trim(coalesce(additional_description, '')) <> trim(coalesce(description, ''))
         then ' - ' || trim(additional_description)
       else ''
     end), '')
 where display_description is null;

create or replace function public.sync_bank_line_transaction_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.transaction_date := coalesce(new.transaction_date, new.txn_date);
  new.amount := coalesce(new.amount, round((new.amount_pence::numeric / 100), 2));
  new.direction := coalesce(new.direction, case when new.amount_pence >= 0 then 'in' else 'out' end);

  if new.money_in is null and new.amount_pence >= 0 then
    new.money_in := round((new.amount_pence::numeric / 100), 2);
  end if;

  if new.money_out is null and new.amount_pence < 0 then
    new.money_out := round((abs(new.amount_pence)::numeric / 100), 2);
  end if;

  if new.running_balance is null and new.balance_pence is not null then
    new.running_balance := round((new.balance_pence::numeric / 100), 2);
  end if;

  if nullif(trim(coalesce(new.display_description, '')), '') is null then
    new.display_description := nullif(trim(coalesce(new.description, '') || case
      when nullif(trim(coalesce(new.additional_description, '')), '') is not null
        and trim(coalesce(new.additional_description, '')) <> trim(coalesce(new.description, ''))
        then ' - ' || trim(new.additional_description)
      else ''
    end), '');
  end if;

  if new.reconciled then
    new.status := 'reconciled';
  elsif new.allocated and new.status = 'unmatched' then
    new.status := 'matched';
  end if;

  return new;
end;
$$;

revoke all on function public.sync_bank_line_transaction_fields() from public;

create or replace view public.bank_transactions
with (security_invoker = true)
as
select
  id,
  workspace_id,
  bank_account_id,
  statement_import_id,
  transaction_date,
  description,
  reference,
  amount,
  direction,
  money_in,
  money_out,
  running_balance,
  fingerprint,
  status,
  matched_source_type,
  matched_source_id,
  posted_journal_id,
  reconciled_at,
  reconciled_by,
  created_at,
  updated_at,
  transaction_time,
  row_number,
  raw as raw_row,
  additional_description,
  display_description
from public.bank_lines;

comment on column public.bank_lines.additional_description is
  'Optional secondary bank narrative/detail column parsed from statement imports.';

comment on column public.bank_lines.display_description is
  'User-facing bank transaction description combining primary and additional narrative without using time or balance fields.';
