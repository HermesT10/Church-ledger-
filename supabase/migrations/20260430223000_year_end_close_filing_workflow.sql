-- Year-end close and Charity Commission filing workflow.

create table if not exists public.year_end_close_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  financial_period_id uuid references public.financial_periods(id) on delete set null,
  financial_year integer not null,
  period_start date not null,
  period_end date not null,
  basis text not null default 'accruals',
  status text not null default 'draft',
  annual_accounts_report_version_id uuid references public.report_versions(id) on delete set null,
  filing_pack_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  locked_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  submission_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint year_end_close_runs_basis_check check (basis in ('cash', 'accruals')),
  constraint year_end_close_runs_status_check check (status in ('draft', 'in_progress', 'ready_for_review', 'approved', 'locked', 'exported', 'submitted', 'archived')),
  constraint year_end_close_runs_year_check check (financial_year between 2000 and 2100),
  constraint year_end_close_runs_period_check check (period_start <= period_end)
);

create table if not exists public.year_end_close_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  run_id uuid not null references public.year_end_close_runs(id) on delete cascade,
  step_key text not null,
  step_number integer not null,
  title text not null,
  description text not null,
  status text not null default 'not_started',
  assigned_to uuid references public.profiles(id) on delete set null,
  due_date date,
  evidence jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  notes text,
  blockers jsonb not null default '[]'::jsonb,
  waiver_reason text,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint year_end_close_steps_status_check check (status in ('not_started', 'in_progress', 'complete', 'blocked', 'waived')),
  constraint year_end_close_steps_number_check check (step_number between 1 and 23),
  constraint year_end_close_steps_evidence_array check (jsonb_typeof(evidence) = 'array'),
  constraint year_end_close_steps_documents_array check (jsonb_typeof(documents) = 'array'),
  constraint year_end_close_steps_blockers_array check (jsonb_typeof(blockers) = 'array')
);

create table if not exists public.filing_packs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  run_id uuid not null references public.year_end_close_runs(id) on delete cascade,
  financial_year integer not null,
  status text not null default 'draft',
  annual_accounts_report_version_id uuid references public.report_versions(id) on delete set null,
  annual_return_summary jsonb not null default '{}'::jsonb,
  pack_payload jsonb not null default '{}'::jsonb,
  evidence_index jsonb not null default '[]'::jsonb,
  export_manifest jsonb not null default '[]'::jsonb,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  submission_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint filing_packs_status_check check (status in ('draft', 'generated', 'approved', 'exported', 'submitted', 'archived')),
  constraint filing_packs_year_check check (financial_year between 2000 and 2100),
  constraint filing_packs_annual_return_object check (jsonb_typeof(annual_return_summary) = 'object'),
  constraint filing_packs_payload_object check (jsonb_typeof(pack_payload) = 'object'),
  constraint filing_packs_evidence_array check (jsonb_typeof(evidence_index) = 'array'),
  constraint filing_packs_manifest_array check (jsonb_typeof(export_manifest) = 'array')
);

create table if not exists public.report_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  run_id uuid not null references public.year_end_close_runs(id) on delete cascade,
  report_version_id uuid references public.report_versions(id) on delete set null,
  approval_type text not null,
  status text not null default 'pending',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_by_name text,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_approvals_type_check check (approval_type in ('trustee_review', 'examiner_review', 'final_approval', 'submission_signoff')),
  constraint report_approvals_status_check check (status in ('pending', 'approved', 'rejected', 'waived'))
);

create table if not exists public.locked_period_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  financial_period_id uuid references public.financial_periods(id) on delete set null,
  context text not null,
  reason text not null,
  requested_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint locked_period_overrides_reason_check check (length(trim(reason)) >= 10)
);

create unique index if not exists year_end_close_runs_workspace_year_basis_idx
  on public.year_end_close_runs (workspace_id, financial_year, basis);

create index if not exists year_end_close_runs_workspace_status_idx
  on public.year_end_close_runs (workspace_id, status, updated_at desc);

create unique index if not exists year_end_close_steps_run_step_key_idx
  on public.year_end_close_steps (run_id, step_key);

create index if not exists year_end_close_steps_workspace_run_idx
  on public.year_end_close_steps (workspace_id, run_id, step_number);

create unique index if not exists filing_packs_run_idx
  on public.filing_packs (run_id);

create index if not exists filing_packs_workspace_status_idx
  on public.filing_packs (workspace_id, status, generated_at desc);

create index if not exists report_approvals_workspace_run_idx
  on public.report_approvals (workspace_id, run_id, approval_type);

create index if not exists locked_period_overrides_workspace_period_idx
  on public.locked_period_overrides (workspace_id, financial_period_id, created_at desc);

alter table public.year_end_close_runs
  drop constraint if exists year_end_close_runs_filing_pack_fk;

alter table public.year_end_close_runs
  add constraint year_end_close_runs_filing_pack_fk
  foreign key (filing_pack_id) references public.filing_packs(id) on delete set null;

drop trigger if exists trg_year_end_close_runs_touch_updated_at on public.year_end_close_runs;
create trigger trg_year_end_close_runs_touch_updated_at
  before update on public.year_end_close_runs
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_year_end_close_steps_touch_updated_at on public.year_end_close_steps;
create trigger trg_year_end_close_steps_touch_updated_at
  before update on public.year_end_close_steps
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_filing_packs_touch_updated_at on public.filing_packs;
create trigger trg_filing_packs_touch_updated_at
  before update on public.filing_packs
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_report_approvals_touch_updated_at on public.report_approvals;
create trigger trg_report_approvals_touch_updated_at
  before update on public.report_approvals
  for each row execute function public.touch_updated_at();

alter table public.year_end_close_runs enable row level security;
alter table public.year_end_close_steps enable row level security;
alter table public.filing_packs enable row level security;
alter table public.report_approvals enable row level security;
alter table public.locked_period_overrides enable row level security;

drop policy if exists year_end_close_runs_select on public.year_end_close_runs;
create policy year_end_close_runs_select
  on public.year_end_close_runs
  for select
  using (
    public.is_org_treasurer_or_admin(workspace_id)
    or (public.is_org_member(workspace_id) and status in ('approved', 'locked', 'exported', 'submitted'))
  );

drop policy if exists year_end_close_runs_insert_treasurer_admin on public.year_end_close_runs;
create policy year_end_close_runs_insert_treasurer_admin
  on public.year_end_close_runs
  for insert
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists year_end_close_runs_update_treasurer_admin on public.year_end_close_runs;
create policy year_end_close_runs_update_treasurer_admin
  on public.year_end_close_runs
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists year_end_close_runs_delete_admin on public.year_end_close_runs;
create policy year_end_close_runs_delete_admin
  on public.year_end_close_runs
  for delete
  using (public.is_org_admin(workspace_id));

drop policy if exists year_end_close_steps_select on public.year_end_close_steps;
create policy year_end_close_steps_select
  on public.year_end_close_steps
  for select
  using (
    public.is_org_treasurer_or_admin(workspace_id)
    or exists (
      select 1
      from public.year_end_close_runs r
      where r.id = year_end_close_steps.run_id
        and r.workspace_id = year_end_close_steps.workspace_id
        and r.status in ('approved', 'locked', 'exported', 'submitted')
        and public.is_org_member(r.workspace_id)
    )
  );

drop policy if exists year_end_close_steps_insert_treasurer_admin on public.year_end_close_steps;
create policy year_end_close_steps_insert_treasurer_admin
  on public.year_end_close_steps
  for insert
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists year_end_close_steps_update_treasurer_admin on public.year_end_close_steps;
create policy year_end_close_steps_update_treasurer_admin
  on public.year_end_close_steps
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists filing_packs_select on public.filing_packs;
create policy filing_packs_select
  on public.filing_packs
  for select
  using (
    public.is_org_treasurer_or_admin(workspace_id)
    or (public.is_org_member(workspace_id) and status in ('approved', 'exported', 'submitted'))
  );

drop policy if exists filing_packs_insert_treasurer_admin on public.filing_packs;
create policy filing_packs_insert_treasurer_admin
  on public.filing_packs
  for insert
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists filing_packs_update_treasurer_admin on public.filing_packs;
create policy filing_packs_update_treasurer_admin
  on public.filing_packs
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists report_approvals_select on public.report_approvals;
create policy report_approvals_select
  on public.report_approvals
  for select
  using (
    public.is_org_treasurer_or_admin(workspace_id)
    or exists (
      select 1
      from public.year_end_close_runs r
      where r.id = report_approvals.run_id
        and r.workspace_id = report_approvals.workspace_id
        and r.status in ('approved', 'locked', 'exported', 'submitted')
        and public.is_org_member(r.workspace_id)
    )
  );

drop policy if exists report_approvals_insert_treasurer_admin on public.report_approvals;
create policy report_approvals_insert_treasurer_admin
  on public.report_approvals
  for insert
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists report_approvals_update_treasurer_admin on public.report_approvals;
create policy report_approvals_update_treasurer_admin
  on public.report_approvals
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists locked_period_overrides_select_admin on public.locked_period_overrides;
create policy locked_period_overrides_select_admin
  on public.locked_period_overrides
  for select
  using (public.is_org_admin(workspace_id));

drop policy if exists locked_period_overrides_insert_admin on public.locked_period_overrides;
create policy locked_period_overrides_insert_admin
  on public.locked_period_overrides
  for insert
  with check (public.is_org_admin(workspace_id));

drop policy if exists locked_period_overrides_update_admin on public.locked_period_overrides;
create policy locked_period_overrides_update_admin
  on public.locked_period_overrides
  for update
  using (public.is_org_admin(workspace_id))
  with check (public.is_org_admin(workspace_id));

create or replace function public.assert_not_locked_financial_date(
  p_workspace_id uuid,
  p_posting_date date,
  p_context text default 'posting'
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.financial_periods fp
    where fp.organisation_id = p_workspace_id
      and fp.status = 'locked'
      and p_posting_date between fp.start_date and fp.end_date
  ) then
    raise exception 'Cannot % into a locked financial period. Post a reversal or adjustment in an open period instead.', p_context
      using errcode = 'check_violation';
  end if;
end;
$$;
