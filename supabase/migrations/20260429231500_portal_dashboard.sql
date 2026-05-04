-- Invited user portal dashboard: tasks, notifications, and realtime hooks.

create table if not exists public.portal_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  status text not null default 'open',
  assigned_to uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_tasks_title_not_empty check (length(trim(title)) > 0),
  constraint portal_tasks_status_check check (status in ('open', 'in_progress', 'done'))
);

create table if not exists public.portal_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  source_type text,
  source_id uuid,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint portal_notifications_type_not_empty check (length(trim(type)) > 0),
  constraint portal_notifications_title_not_empty check (length(trim(title)) > 0),
  constraint portal_notifications_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_portal_tasks_assigned_due
  on public.portal_tasks (workspace_id, assigned_to, status, due_at);

create index if not exists idx_portal_tasks_calendar_event
  on public.portal_tasks (calendar_event_id)
  where calendar_event_id is not null;

create index if not exists idx_portal_notifications_user_created
  on public.portal_notifications (workspace_id, user_id, created_at desc);

create index if not exists idx_portal_notifications_unread
  on public.portal_notifications (workspace_id, user_id, created_at desc)
  where read_at is null;

drop trigger if exists trg_portal_tasks_touch_updated_at on public.portal_tasks;
create trigger trg_portal_tasks_touch_updated_at
  before update on public.portal_tasks
  for each row execute function public.touch_updated_at();

alter table public.portal_tasks enable row level security;
alter table public.portal_notifications enable row level security;

drop policy if exists portal_tasks_select on public.portal_tasks;
create policy portal_tasks_select on public.portal_tasks
  for select using (public.is_org_admin(workspace_id) or assigned_to = auth.uid());

drop policy if exists portal_tasks_insert_admin on public.portal_tasks;
create policy portal_tasks_insert_admin on public.portal_tasks
  for insert with check (public.is_org_admin(workspace_id));

drop policy if exists portal_tasks_update_admin_or_assignee on public.portal_tasks;
create policy portal_tasks_update_admin_or_assignee on public.portal_tasks
  for update using (public.is_org_admin(workspace_id) or assigned_to = auth.uid())
  with check (public.is_org_admin(workspace_id) or assigned_to = auth.uid());

drop policy if exists portal_tasks_delete_admin on public.portal_tasks;
create policy portal_tasks_delete_admin on public.portal_tasks
  for delete using (public.is_org_admin(workspace_id));

drop policy if exists portal_notifications_select on public.portal_notifications;
create policy portal_notifications_select on public.portal_notifications
  for select using (public.is_org_admin(workspace_id) or user_id = auth.uid());

drop policy if exists portal_notifications_insert_admin on public.portal_notifications;
create policy portal_notifications_insert_admin on public.portal_notifications
  for insert with check (public.is_org_admin(workspace_id));

drop policy if exists portal_notifications_update_admin_or_recipient on public.portal_notifications;
create policy portal_notifications_update_admin_or_recipient on public.portal_notifications
  for update using (public.is_org_admin(workspace_id) or user_id = auth.uid())
  with check (public.is_org_admin(workspace_id) or user_id = auth.uid());

drop policy if exists portal_notifications_delete_admin on public.portal_notifications;
create policy portal_notifications_delete_admin on public.portal_notifications
  for delete using (public.is_org_admin(workspace_id));

do $$
begin
  alter publication supabase_realtime add table public.portal_tasks;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.portal_notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
