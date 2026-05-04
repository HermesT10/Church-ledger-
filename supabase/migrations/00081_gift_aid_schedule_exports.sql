-- 00081_gift_aid_schedule_exports.sql
-- Versioned HMRC schedule exports with spreadsheet + PDF storage and line locks.

alter table public.gift_aid_exports
  drop constraint if exists gift_aid_exports_export_format_check;

alter table public.gift_aid_exports
  add constraint gift_aid_exports_export_format_check
  check (export_format in ('hmrc_csv', 'hmrc_xlsx', 'pdf_review', 'csv', 'json'));

alter table public.gift_aid_exports
  add column if not exists version integer not null default 1,
  add column if not exists generated_by uuid references public.profiles(id) on delete set null,
  add column if not exists generated_at timestamptz not null default now(),
  add column if not exists donation_total_pence bigint not null default 0,
  add column if not exists gift_aid_total_pence bigint not null default 0,
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_file_name text,
  add column if not exists validation_summary jsonb not null default '{}'::jsonb,
  add column if not exists export_readiness text not null default 'ready'
    check (export_readiness in ('ready', 'warnings', 'blocked'));

update public.gift_aid_exports
   set generated_by = coalesce(generated_by, exported_by),
       generated_at = coalesce(generated_at, exported_at);

create unique index if not exists uq_gift_aid_exports_batch_version
  on public.gift_aid_exports (claim_batch_id, version);

alter table public.gift_aid_claim_lines
  add column if not exists export_locked_at timestamptz,
  add column if not exists export_locked_by uuid references public.profiles(id) on delete set null,
  add column if not exists export_version integer;

create index if not exists idx_gift_aid_claim_lines_export_lock
  on public.gift_aid_claim_lines (workspace_id, claim_batch_id, export_version)
  where export_locked_at is not null;
