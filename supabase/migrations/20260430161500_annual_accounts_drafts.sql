-- Annual accounts draft builder state for trustee-ready accounts production.

create table if not exists public.annual_accounts_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  financial_year integer not null,
  basis text not null default 'accruals',
  current_step text not null default 'select-financial-year',
  charity_details jsonb not null default '{}'::jsonb,
  trustees_and_officers jsonb not null default '[]'::jsonb,
  examiner_details jsonb not null default '{}'::jsonb,
  narrative_sections jsonb not null default '{}'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  validation_results jsonb not null default '[]'::jsonb,
  approval jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  report_version_id uuid references public.report_versions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_accounts_drafts_basis_check check (basis in ('cash', 'accruals')),
  constraint annual_accounts_drafts_status_check check (status in ('draft', 'review', 'approved', 'final', 'archived')),
  constraint annual_accounts_drafts_year_check check (financial_year between 2000 and 2100),
  constraint annual_accounts_drafts_charity_details_object check (jsonb_typeof(charity_details) = 'object'),
  constraint annual_accounts_drafts_trustees_array check (jsonb_typeof(trustees_and_officers) = 'array'),
  constraint annual_accounts_drafts_examiner_object check (jsonb_typeof(examiner_details) = 'object'),
  constraint annual_accounts_drafts_narrative_object check (jsonb_typeof(narrative_sections) = 'object'),
  constraint annual_accounts_drafts_notes_array check (jsonb_typeof(notes) = 'array'),
  constraint annual_accounts_drafts_validation_array check (jsonb_typeof(validation_results) = 'array'),
  constraint annual_accounts_drafts_approval_object check (jsonb_typeof(approval) = 'object')
);

create unique index if not exists annual_accounts_drafts_workspace_year_basis_idx
  on public.annual_accounts_drafts (workspace_id, financial_year, basis);

create index if not exists annual_accounts_drafts_workspace_status_idx
  on public.annual_accounts_drafts (workspace_id, status, updated_at desc);

alter table public.annual_accounts_drafts enable row level security;

drop policy if exists annual_accounts_drafts_select_member on public.annual_accounts_drafts;
create policy annual_accounts_drafts_select_member
  on public.annual_accounts_drafts
  for select
  using (
    public.is_org_treasurer_or_admin(workspace_id)
    or (
      public.is_org_member(workspace_id)
      and status in ('approved', 'final')
    )
  );

drop policy if exists annual_accounts_drafts_insert_treasurer_admin on public.annual_accounts_drafts;
create policy annual_accounts_drafts_insert_treasurer_admin
  on public.annual_accounts_drafts
  for insert
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists annual_accounts_drafts_update_treasurer_admin on public.annual_accounts_drafts;
create policy annual_accounts_drafts_update_treasurer_admin
  on public.annual_accounts_drafts
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists annual_accounts_drafts_delete_admin on public.annual_accounts_drafts;
create policy annual_accounts_drafts_delete_admin
  on public.annual_accounts_drafts
  for delete
  using (public.is_org_admin(workspace_id));
