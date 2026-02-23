-- 00026_onboarding_progress.sql
-- Phase 9.4: Onboarding wizard progress tracking per organisation.

create table public.onboarding_progress (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  current_step    int not null default 1,
  completed_steps jsonb not null default '[]'::jsonb,
  is_completed    boolean not null default false,
  updated_at      timestamptz not null default now()
);

alter table public.onboarding_progress enable row level security;

-- Members can read their org's onboarding progress
create policy "members can read onboarding progress"
  on public.onboarding_progress for select
  using (public.is_org_member(organisation_id));

-- Admin/Treasurer can insert onboarding progress
create policy "admin/treasurer can insert onboarding progress"
  on public.onboarding_progress for insert
  with check (public.is_org_treasurer_or_admin(organisation_id));

-- Admin/Treasurer can update onboarding progress
create policy "admin/treasurer can update onboarding progress"
  on public.onboarding_progress for update
  using (public.is_org_treasurer_or_admin(organisation_id));
