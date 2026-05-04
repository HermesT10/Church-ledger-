-- 00063_gift_aid_validation_results.sql
-- Structured Gift Aid validation results stored on donations.

alter table public.donations
  add column if not exists gift_aid_validation_result jsonb not null default '{}'::jsonb;
