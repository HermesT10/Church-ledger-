alter table public.bank_lines
  add column if not exists transaction_time text,
  add column if not exists row_number integer;

create index if not exists idx_bank_lines_import_row_number
  on public.bank_lines (workspace_id, bank_account_id, statement_import_id, row_number)
  where statement_import_id is not null;

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
  raw as raw_row
from public.bank_lines;

comment on column public.bank_lines.transaction_time is
  'Optional transaction time parsed from imported bank statements. Stored separately from description so time is not used as transaction narrative.';

comment on column public.bank_lines.row_number is
  'Original parsed statement data row number for audit traceability and safe import reprocessing.';

