create table public.month_end_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  review_month date not null,
  completed_step_keys text[] not null default '{}',
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, review_month)
);
