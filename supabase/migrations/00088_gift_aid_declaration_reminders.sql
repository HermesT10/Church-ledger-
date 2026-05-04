-- 00088_gift_aid_declaration_reminders.sql
-- Workspace-scoped reminders for Gift Aid declarations (renewal, missing docs, cancellations).
-- Operational thresholds on organisation_settings.

alter table public.gift_aid_declarations
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_evidence_notes text;

alter table public.organisation_settings
  add column if not exists gift_aid_reminder_stale_declaration_days integer not null default 365
    check (gift_aid_reminder_stale_declaration_days >= 30 and gift_aid_reminder_stale_declaration_days <= 1825),
  add column if not exists gift_aid_reminder_no_donation_days integer not null default 540
    check (gift_aid_reminder_no_donation_days >= 30 and gift_aid_reminder_no_donation_days <= 2555),
  add column if not exists gift_aid_require_signed_declaration_copy boolean not null default false;

create table if not exists public.gift_aid_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  donor_id uuid references public.donors(id) on delete cascade,
  declaration_id uuid references public.gift_aid_declarations(id) on delete cascade,
  donation_id uuid references public.donations(id) on delete set null,
  reminder_type text not null,
  severity text not null
    check (severity in ('info', 'warning', 'urgent')),
  message text not null,
  status text not null default 'open'
    check (status in ('open', 'dismissed', 'resolved')),
  due_date date,
  dedupe_key text not null,
  dismissed_by uuid references public.profiles(id) on delete set null,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_gift_aid_reminders_workspace_dedupe
  on public.gift_aid_reminders (workspace_id, dedupe_key);

create index if not exists idx_gift_aid_reminders_workspace_status
  on public.gift_aid_reminders (workspace_id, status)
  where status = 'open';

create index if not exists idx_gift_aid_reminders_donor
  on public.gift_aid_reminders (workspace_id, donor_id)
  where donor_id is not null;

create or replace function public.gift_aid_reminders_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gift_aid_reminders_set_updated_at on public.gift_aid_reminders;
create trigger gift_aid_reminders_set_updated_at
  before update on public.gift_aid_reminders
  for each row execute function public.gift_aid_reminders_set_updated_at();

alter table public.gift_aid_reminders enable row level security;
alter table public.gift_aid_reminders force row level security;

drop policy if exists gift_aid_reminders_select_member on public.gift_aid_reminders;
create policy gift_aid_reminders_select_member
  on public.gift_aid_reminders
  for select using (public.is_org_member(workspace_id));

drop policy if exists gift_aid_reminders_insert_writer on public.gift_aid_reminders;
create policy gift_aid_reminders_insert_writer
  on public.gift_aid_reminders
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_reminders_update_writer on public.gift_aid_reminders;
create policy gift_aid_reminders_update_writer
  on public.gift_aid_reminders
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_reminders_delete_writer on public.gift_aid_reminders;
create policy gift_aid_reminders_delete_writer
  on public.gift_aid_reminders
  for delete using (public.is_org_treasurer_or_admin(workspace_id));
