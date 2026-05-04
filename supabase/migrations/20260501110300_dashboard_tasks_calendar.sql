-- Persist dashboard task state and link task cards to calendar events.

create table if not exists public.dashboard_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  task_key text not null,
  title text not null,
  description text,
  href text not null,
  type text not null default 'info',
  source_type text not null default 'dashboard',
  source_id text,
  due_at timestamptz,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  status text not null default 'active',
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  last_seen_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_tasks_title_not_empty check (length(trim(title)) > 0),
  constraint dashboard_tasks_href_not_empty check (length(trim(href)) > 0),
  constraint dashboard_tasks_type_check check (type in ('warning', 'info', 'action')),
  constraint dashboard_tasks_status_check check (status in ('active', 'completed', 'inactive')),
  constraint dashboard_tasks_completion_check check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  )
);

create unique index if not exists idx_dashboard_tasks_workspace_key
  on public.dashboard_tasks (workspace_id, task_key);

create index if not exists idx_dashboard_tasks_workspace_status_due
  on public.dashboard_tasks (workspace_id, status, due_at, created_at desc);

create index if not exists idx_dashboard_tasks_calendar_event
  on public.dashboard_tasks (calendar_event_id)
  where calendar_event_id is not null;

drop trigger if exists trg_dashboard_tasks_touch_updated_at
  on public.dashboard_tasks;
create trigger trg_dashboard_tasks_touch_updated_at
  before update on public.dashboard_tasks
  for each row execute function public.touch_updated_at();

alter table public.dashboard_tasks enable row level security;
alter table public.dashboard_tasks force row level security;

drop policy if exists dashboard_tasks_select_member on public.dashboard_tasks;
create policy dashboard_tasks_select_member
  on public.dashboard_tasks
  for select using (public.is_org_member(workspace_id));

drop policy if exists dashboard_tasks_insert_admin on public.dashboard_tasks;
create policy dashboard_tasks_insert_admin
  on public.dashboard_tasks
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists dashboard_tasks_update_admin on public.dashboard_tasks;
create policy dashboard_tasks_update_admin
  on public.dashboard_tasks
  for update using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists dashboard_tasks_delete_admin on public.dashboard_tasks;
create policy dashboard_tasks_delete_admin
  on public.dashboard_tasks
  for delete using (public.is_org_treasurer_or_admin(workspace_id));
