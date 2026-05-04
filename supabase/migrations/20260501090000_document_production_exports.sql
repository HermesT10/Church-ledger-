-- Professional document production and stored export versions.

insert into storage.buckets (id, name, public)
values ('document-exports', 'document-exports', false)
on conflict (id) do update set public = false;

create table if not exists public.export_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  source_report_id uuid,
  source_report_type text,
  source_kind text not null,
  format text not null,
  file_name text not null,
  file_path text not null,
  content_type text not null,
  checksum_sha256 text not null,
  status text not null default 'generated',
  version integer not null default 1,
  validation_snapshot jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint export_versions_source_kind_check check (source_kind in (
    'report_version',
    'annual_accounts',
    'trustee_pack',
    'year_end_filing_pack',
    'gift_aid_schedule',
    'audit_log',
    'fund_summary',
    'payroll_report',
    'bank_reconciliation_certificate',
    'evidence_index'
  )),
  constraint export_versions_format_check check (format in ('pdf', 'docx', 'excel', 'csv')),
  constraint export_versions_status_check check (status in ('draft', 'generated', 'approved', 'final', 'archived')),
  constraint export_versions_version_positive check (version > 0),
  constraint export_versions_validation_array check (jsonb_typeof(validation_snapshot) = 'array'),
  constraint export_versions_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint export_versions_checksum_check check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  constraint export_versions_file_path_workspace_check check (position(workspace_id::text || '/' in file_path) = 1)
);

create unique index if not exists export_versions_workspace_source_format_version_idx
  on public.export_versions (workspace_id, source_kind, source_report_id, format, version);

create index if not exists export_versions_workspace_source_idx
  on public.export_versions (workspace_id, source_kind, source_report_id, generated_at desc);

create index if not exists export_versions_workspace_status_idx
  on public.export_versions (workspace_id, status, generated_at desc);

drop trigger if exists trg_export_versions_touch_updated_at on public.export_versions;
create trigger trg_export_versions_touch_updated_at
  before update on public.export_versions
  for each row execute function public.touch_updated_at();

alter table public.export_versions enable row level security;

drop policy if exists export_versions_select on public.export_versions;
create policy export_versions_select
  on public.export_versions
  for select
  using (
    public.is_org_treasurer_or_admin(workspace_id)
    or (
      public.is_org_member(workspace_id)
      and status in ('approved', 'final')
      and (
        source_kind <> 'report_version'
        or exists (
          select 1
          from public.report_versions rv
          where rv.id = export_versions.source_report_id
            and rv.workspace_id = export_versions.workspace_id
            and rv.status in ('approved', 'exported', 'archived')
        )
      )
    )
  );

drop policy if exists export_versions_insert_treasurer_admin on public.export_versions;
create policy export_versions_insert_treasurer_admin
  on public.export_versions
  for insert
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists export_versions_update_treasurer_admin on public.export_versions;
create policy export_versions_update_treasurer_admin
  on public.export_versions
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists export_versions_delete_admin on public.export_versions;
create policy export_versions_delete_admin
  on public.export_versions
  for delete
  using (public.is_org_admin(workspace_id));

drop policy if exists document_exports_select on storage.objects;
drop policy if exists document_exports_insert on storage.objects;
drop policy if exists document_exports_update on storage.objects;
drop policy if exists document_exports_delete on storage.objects;

create policy document_exports_select
on storage.objects for select
using (
  bucket_id = 'document-exports'
  and exists (
    select 1
    from public.export_versions ev
    where ev.file_path = storage.objects.name
      and ev.workspace_id = ((storage.foldername(storage.objects.name))[1])::uuid
      and (
        public.is_org_treasurer_or_admin(ev.workspace_id)
        or (
          public.is_org_member(ev.workspace_id)
          and ev.status in ('approved', 'final')
        )
      )
  )
);

create policy document_exports_insert
on storage.objects for insert
with check (
  bucket_id = 'document-exports'
  and public.is_org_treasurer_or_admin(((storage.foldername(name))[1])::uuid)
);

create policy document_exports_update
on storage.objects for update
using (
  bucket_id = 'document-exports'
  and public.is_org_treasurer_or_admin(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'document-exports'
  and public.is_org_treasurer_or_admin(((storage.foldername(name))[1])::uuid)
);

create policy document_exports_delete
on storage.objects for delete
using (
  bucket_id = 'document-exports'
  and public.is_org_treasurer_or_admin(((storage.foldername(name))[1])::uuid)
);
