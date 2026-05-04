-- 00090_bank_rules_automation.sql
-- Adds rule action metadata needed for automated categorisation suggestions.

alter table public.bank_rules
  add column if not exists description_template text,
  add column if not exists last_applied_at timestamptz,
  add column if not exists last_applied_bank_transaction_id uuid references public.bank_lines(id) on delete set null,
  add column if not exists applied_count integer not null default 0 check (applied_count >= 0);

create index if not exists idx_bank_rules_last_applied
  on public.bank_rules (workspace_id, last_applied_at desc)
  where last_applied_at is not null;

create index if not exists idx_bank_rules_last_applied_bank_line
  on public.bank_rules (last_applied_bank_transaction_id)
  where last_applied_bank_transaction_id is not null;
