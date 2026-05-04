-- Professional reporting engine persistence
-- Stores versioned report snapshots and export events with workspace-scoped RLS.

create table if not exists public.report_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  report_type text not null,
  report_title text not null,
  period_start date not null,
  period_end date not null,
  financial_year integer,
  basis text not null default 'accruals',
  funds_included jsonb not null default '[]'::jsonb,
  filters_applied jsonb not null default '{}'::jsonb,
  validation_summary jsonb not null default '[]'::jsonb,
  traceability_summary jsonb not null default '[]'::jsonb,
  snapshot_payload jsonb not null default '{}'::jsonb,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  prepared_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  exported_by uuid references public.profiles(id) on delete set null,
  exported_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  status text not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_versions_basis_check check (basis in ('cash', 'accruals')),
  constraint report_versions_status_check check (status in ('draft', 'review', 'approved', 'exported', 'archived')),
  constraint report_versions_period_check check (period_start <= period_end),
  constraint report_versions_version_positive check (version > 0),
  constraint report_versions_funds_array check (jsonb_typeof(funds_included) = 'array'),
  constraint report_versions_filters_object check (jsonb_typeof(filters_applied) = 'object'),
  constraint report_versions_validation_array check (jsonb_typeof(validation_summary) = 'array'),
  constraint report_versions_traceability_array check (jsonb_typeof(traceability_summary) = 'array'),
  constraint report_versions_snapshot_object check (jsonb_typeof(snapshot_payload) = 'object')
);

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  report_version_id uuid not null references public.report_versions(id) on delete cascade,
  report_type text not null,
  format text not null,
  file_name text not null,
  storage_path text,
  checksum_sha256 text,
  export_payload jsonb not null default '{}'::jsonb,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint report_exports_format_check check (format in ('pdf', 'csv', 'excel', 'docx')),
  constraint report_exports_payload_object check (jsonb_typeof(export_payload) = 'object'),
  constraint report_exports_checksum_check check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$')
);

create table if not exists public.report_approval_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  report_version_id uuid not null references public.report_versions(id) on delete cascade,
  action text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint report_approval_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_report_versions_workspace_type_generated
  on public.report_versions (workspace_id, report_type, generated_at desc);

create index if not exists idx_report_versions_workspace_status
  on public.report_versions (workspace_id, status);

create index if not exists idx_report_versions_workspace_period
  on public.report_versions (workspace_id, period_start, period_end);

create unique index if not exists idx_report_versions_workspace_type_version
  on public.report_versions (workspace_id, report_type, version);

create index if not exists idx_report_exports_workspace_version
  on public.report_exports (workspace_id, report_version_id, generated_at desc);

create index if not exists idx_report_approval_events_workspace_version
  on public.report_approval_events (workspace_id, report_version_id, created_at desc);

drop trigger if exists trg_report_versions_touch_updated_at on public.report_versions;
create trigger trg_report_versions_touch_updated_at
  before update on public.report_versions
  for each row execute function public.touch_updated_at();

alter table public.report_versions enable row level security;
alter table public.report_exports enable row level security;
alter table public.report_approval_events enable row level security;

drop policy if exists report_versions_select on public.report_versions;
create policy report_versions_select on public.report_versions
  for select using (
    public.is_org_treasurer_or_admin(workspace_id)
    or (status in ('approved', 'exported', 'archived') and public.is_org_member(workspace_id))
  );

drop policy if exists report_versions_insert_admin_treasurer on public.report_versions;
create policy report_versions_insert_admin_treasurer on public.report_versions
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists report_versions_update_admin_treasurer on public.report_versions;
create policy report_versions_update_admin_treasurer on public.report_versions
  for update using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists report_versions_delete_admin_treasurer on public.report_versions;
create policy report_versions_delete_admin_treasurer on public.report_versions
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists report_exports_select on public.report_exports;
create policy report_exports_select on public.report_exports
  for select using (
    public.is_org_treasurer_or_admin(workspace_id)
    or exists (
      select 1
      from public.report_versions rv
      where rv.id = report_exports.report_version_id
        and rv.workspace_id = report_exports.workspace_id
        and rv.status in ('approved', 'exported', 'archived')
        and public.is_org_member(rv.workspace_id)
    )
  );

drop policy if exists report_exports_insert_admin_treasurer on public.report_exports;
create policy report_exports_insert_admin_treasurer on public.report_exports
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists report_exports_update_admin_treasurer on public.report_exports;
create policy report_exports_update_admin_treasurer on public.report_exports
  for update using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists report_exports_delete_admin_treasurer on public.report_exports;
create policy report_exports_delete_admin_treasurer on public.report_exports
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists report_approval_events_select on public.report_approval_events;
create policy report_approval_events_select on public.report_approval_events
  for select using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists report_approval_events_insert_admin_treasurer on public.report_approval_events;
create policy report_approval_events_insert_admin_treasurer on public.report_approval_events
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));
