-- Correction events: high-level audit for orchestrated banking corrections (e.g. statement import removal).

create table if not exists public.correction_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  event_type text not null
    check (event_type in ('bank_statement_import_removed')),
  bank_statement_import_id uuid not null,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete set null,
  reason text not null
    check (length(trim(reason)) >= 3),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint correction_events_tenant_sync check (workspace_id = organisation_id)
);

create index if not exists idx_correction_events_workspace_created
  on public.correction_events (workspace_id, created_at desc);

create index if not exists idx_correction_events_statement_import
  on public.correction_events (workspace_id, bank_statement_import_id, created_at desc);

comment on table public.correction_events is
  'Append-only events for multi-step banking corrections (beyond per-line reconciliation_corrections).';

drop trigger if exists trg_correction_events_sync_tenant on public.correction_events;
create trigger trg_correction_events_sync_tenant
before insert or update on public.correction_events
for each row execute function public.sync_workspace_and_organisation_ids();

alter table public.correction_events enable row level security;
alter table public.correction_events force row level security;

drop policy if exists correction_events_select_member on public.correction_events;
create policy correction_events_select_member on public.correction_events
  for select using (public.is_org_member(workspace_id));

drop policy if exists correction_events_insert_treasurer_admin on public.correction_events;
create policy correction_events_insert_treasurer_admin on public.correction_events
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));
