-- Calendar module: stored events, attendees, reminders, resources, and links.
-- Source finance records remain authoritative and are projected by app code.

create extension if not exists pgcrypto;

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'general',
  status text not null default 'scheduled',
  visibility text not null default 'workspace',
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  location text,
  resource_id uuid,
  recurrence_rule text not null default 'none',
  recurrence_until timestamptz,
  linked_fund_id uuid references public.funds(id) on delete set null,
  linked_account_id uuid references public.accounts(id) on delete set null,
  linked_source_type text,
  linked_source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,

  constraint calendar_events_category_check check (
    category in (
      'general', 'worship', 'trustee_meeting', 'letting', 'finance_deadline',
      'payroll', 'gift_aid', 'month_end_close', 'payment_run',
      'budget_review', 'bank_reconciliation', 'reminder'
    )
  ),
  constraint calendar_events_status_check check (status in ('scheduled', 'tentative', 'cancelled', 'completed')),
  constraint calendar_events_visibility_check check (visibility in ('workspace', 'private', 'selected_users')),
  constraint calendar_events_recurrence_check check (recurrence_rule in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  constraint calendar_events_date_order_check check (end_at is null or end_at >= start_at)
);

create table if not exists public.calendar_resources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  description text,
  location text,
  capacity integer,
  allow_double_booking boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_resources_capacity_check check (capacity is null or capacity >= 0),
  constraint calendar_resources_unique_name unique (workspace_id, name)
);

alter table public.calendar_events
  drop constraint if exists calendar_events_resource_id_fkey;
alter table public.calendar_events
  add constraint calendar_events_resource_id_fkey
  foreign key (resource_id) references public.calendar_resources(id) on delete set null;

create table if not exists public.calendar_event_attendees (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  attendee_user_id uuid references public.profiles(id) on delete cascade,
  attendee_email text,
  attendee_name text,
  role text not null default 'attendee',
  response text not null default 'pending',
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  notes text,

  constraint calendar_event_attendees_role_check check (role in ('organiser', 'attendee', 'optional')),
  constraint calendar_event_attendees_response_check check (response in ('pending', 'accepted', 'declined', 'tentative')),
  constraint calendar_event_attendees_identity_check check (attendee_user_id is not null or attendee_email is not null)
);

create unique index if not exists idx_calendar_attendees_unique_user
  on public.calendar_event_attendees (event_id, attendee_user_id)
  where attendee_user_id is not null;

create unique index if not exists idx_calendar_attendees_unique_email
  on public.calendar_event_attendees (event_id, lower(attendee_email))
  where attendee_email is not null;

create table if not exists public.calendar_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  event_id uuid references public.calendar_events(id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  channel text not null default 'in_app',
  state text not null default 'scheduled',
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_reminders_channel_check check (channel in ('in_app', 'email_placeholder')),
  constraint calendar_reminders_state_check check (state in ('scheduled', 'sent', 'dismissed', 'completed', 'cancelled'))
);

create table if not exists public.calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  label text,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint calendar_event_links_source_type_check check (
    source_type in (
      'bill', 'letting_charge', 'letting_hirer', 'payroll_run', 'payment_run',
      'gift_aid_claim_batch', 'month_end_review', 'budget', 'bank_reconciliation',
      'workflow', 'fund', 'account', 'manual'
    )
  ),
  constraint calendar_event_links_unique_source unique (event_id, source_type, source_id)
);

create index if not exists idx_calendar_events_workspace_range
  on public.calendar_events (workspace_id, start_at, coalesce(end_at, start_at));
create index if not exists idx_calendar_events_resource_range
  on public.calendar_events (workspace_id, resource_id, start_at, coalesce(end_at, start_at))
  where resource_id is not null and status = 'scheduled';
create index if not exists idx_calendar_events_category_status
  on public.calendar_events (workspace_id, category, status, start_at);
create index if not exists idx_calendar_events_visibility
  on public.calendar_events (workspace_id, visibility);
create index if not exists idx_calendar_events_linked_source
  on public.calendar_events (workspace_id, linked_source_type, linked_source_id);
create index if not exists idx_calendar_attendees_event
  on public.calendar_event_attendees (workspace_id, event_id);
create index if not exists idx_calendar_attendees_user
  on public.calendar_event_attendees (workspace_id, attendee_user_id, response)
  where attendee_user_id is not null;
create index if not exists idx_calendar_reminders_due
  on public.calendar_reminders (workspace_id, due_at, state);
create index if not exists idx_calendar_reminders_event
  on public.calendar_reminders (event_id);
create index if not exists idx_calendar_resources_workspace_active
  on public.calendar_resources (workspace_id, is_active, name);
create index if not exists idx_calendar_event_links_source
  on public.calendar_event_links (workspace_id, source_type, source_id);

drop trigger if exists trg_calendar_events_updated_at on public.calendar_events;
create trigger trg_calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_calendar_resources_updated_at on public.calendar_resources;
create trigger trg_calendar_resources_updated_at
  before update on public.calendar_resources
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_calendar_reminders_updated_at on public.calendar_reminders;
create trigger trg_calendar_reminders_updated_at
  before update on public.calendar_reminders
  for each row execute function public.touch_updated_at();

alter table public.calendar_events enable row level security;
alter table public.calendar_event_attendees enable row level security;
alter table public.calendar_reminders enable row level security;
alter table public.calendar_resources enable row level security;
alter table public.calendar_event_links enable row level security;

create or replace function public.is_calendar_event_attendee(p_event_id uuid)
returns boolean
language sql stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.calendar_event_attendees
    where event_id = p_event_id
      and attendee_user_id = auth.uid()
  );
$$;

revoke all on function public.is_calendar_event_attendee(uuid) from public;
grant execute on function public.is_calendar_event_attendee(uuid) to authenticated;

create or replace function public.can_read_calendar_event(
  p_workspace_id uuid,
  p_event_id uuid,
  p_visibility text,
  p_created_by uuid
)
returns boolean
language sql stable
security definer
set search_path = public, auth
as $$
  select public.is_org_member(p_workspace_id)
    and (
      p_visibility = 'workspace'
      or p_created_by = auth.uid()
      or public.is_calendar_event_attendee(p_event_id)
    );
$$;

revoke all on function public.can_read_calendar_event(uuid, uuid, text, uuid) from public;
grant execute on function public.can_read_calendar_event(uuid, uuid, text, uuid) to authenticated;

drop policy if exists calendar_events_select_member_visibility on public.calendar_events;
create policy calendar_events_select_member_visibility
  on public.calendar_events
  for select using (
    public.can_read_calendar_event(workspace_id, id, visibility, created_by)
  );

drop policy if exists calendar_events_insert_writer on public.calendar_events;
create policy calendar_events_insert_writer
  on public.calendar_events
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists calendar_events_update_writer on public.calendar_events;
create policy calendar_events_update_writer
  on public.calendar_events
  for update using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists calendar_events_delete_writer on public.calendar_events;
create policy calendar_events_delete_writer
  on public.calendar_events
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists calendar_attendees_select_visible on public.calendar_event_attendees;
create policy calendar_attendees_select_visible
  on public.calendar_event_attendees
  for select using (
    attendee_user_id = auth.uid()
    or exists (
      select 1
      from public.calendar_events ce
      where ce.id = calendar_event_attendees.event_id
        and public.can_read_calendar_event(ce.workspace_id, ce.id, ce.visibility, ce.created_by)
    )
  );

drop policy if exists calendar_attendees_insert_writer on public.calendar_event_attendees;
create policy calendar_attendees_insert_writer
  on public.calendar_event_attendees
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists calendar_attendees_update_writer_or_self_response on public.calendar_event_attendees;
create policy calendar_attendees_update_writer_or_self_response
  on public.calendar_event_attendees
  for update using (
    public.is_org_treasurer_or_admin(workspace_id)
    or attendee_user_id = auth.uid()
  )
  with check (
    public.is_org_treasurer_or_admin(workspace_id)
    or attendee_user_id = auth.uid()
  );

drop policy if exists calendar_attendees_delete_writer on public.calendar_event_attendees;
create policy calendar_attendees_delete_writer
  on public.calendar_event_attendees
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists calendar_resources_select_member on public.calendar_resources;
create policy calendar_resources_select_member
  on public.calendar_resources
  for select using (public.is_org_member(workspace_id));

drop policy if exists calendar_resources_insert_writer on public.calendar_resources;
create policy calendar_resources_insert_writer
  on public.calendar_resources
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists calendar_resources_update_writer on public.calendar_resources;
create policy calendar_resources_update_writer
  on public.calendar_resources
  for update using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists calendar_resources_delete_writer on public.calendar_resources;
create policy calendar_resources_delete_writer
  on public.calendar_resources
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists calendar_reminders_select_member on public.calendar_reminders;
create policy calendar_reminders_select_member
  on public.calendar_reminders
  for select using (
    public.is_org_member(workspace_id)
    and (
      assigned_to is null
      or assigned_to = auth.uid()
      or public.is_org_treasurer_or_admin(workspace_id)
    )
  );

drop policy if exists calendar_reminders_insert_writer on public.calendar_reminders;
create policy calendar_reminders_insert_writer
  on public.calendar_reminders
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists calendar_reminders_update_writer_or_assignee on public.calendar_reminders;
create policy calendar_reminders_update_writer_or_assignee
  on public.calendar_reminders
  for update using (
    public.is_org_treasurer_or_admin(workspace_id)
    or assigned_to = auth.uid()
  )
  with check (
    public.is_org_treasurer_or_admin(workspace_id)
    or assigned_to = auth.uid()
  );

drop policy if exists calendar_reminders_delete_writer on public.calendar_reminders;
create policy calendar_reminders_delete_writer
  on public.calendar_reminders
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists calendar_links_select_visible on public.calendar_event_links;
create policy calendar_links_select_visible
  on public.calendar_event_links
  for select using (
    exists (
      select 1
      from public.calendar_events ce
      where ce.id = calendar_event_links.event_id
        and public.can_read_calendar_event(ce.workspace_id, ce.id, ce.visibility, ce.created_by)
    )
  );

drop policy if exists calendar_links_insert_writer on public.calendar_event_links;
create policy calendar_links_insert_writer
  on public.calendar_event_links
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists calendar_links_update_writer on public.calendar_event_links;
create policy calendar_links_update_writer
  on public.calendar_event_links
  for update using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists calendar_links_delete_writer on public.calendar_event_links;
create policy calendar_links_delete_writer
  on public.calendar_event_links
  for delete using (public.is_org_treasurer_or_admin(workspace_id));

insert into public.calendar_resources (workspace_id, name, description)
select o.id, seed.name, 'Default calendar resource'
from public.organisations o
cross join (
  values
    ('Main Hall'),
    ('Small Hall'),
    ('Sanctuary'),
    ('Meeting Room'),
    ('Kitchen'),
    ('Office')
) as seed(name)
on conflict (workspace_id, name) do nothing;

comment on table public.calendar_events is
  'Manual workspace calendar events. Existing finance/source records are projected by app code and remain authoritative.';
