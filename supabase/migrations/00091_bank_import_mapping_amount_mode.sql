alter table public.bank_import_mappings
  add column if not exists time_column text,
  add column if not exists amount_mode text not null default 'signed';

alter table public.bank_import_mappings
  drop constraint if exists bank_import_mappings_amount_mode_check;

alter table public.bank_import_mappings
  add constraint bank_import_mappings_amount_mode_check
  check (amount_mode in ('signed', 'separate'));

