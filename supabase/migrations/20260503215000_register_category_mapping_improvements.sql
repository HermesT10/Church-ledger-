-- Register category mapping improvements.
-- Adds register-type and description-pattern support so register row mappings can
-- classify future similar income and expense transactions without changing the GL account.

alter table if exists public.register_category_mappings
  add column if not exists register_type text,
  add column if not exists description_pattern text,
  add column if not exists priority integer not null default 100,
  add column if not exists created_from_transaction_id uuid,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.register_category_mappings m
set register_type = rc.register_type
from public.register_categories rc
where m.register_category_id = rc.id
  and m.register_type is null;

alter table if exists public.register_category_mappings
  alter column register_type set not null;

alter table if exists public.register_category_mappings
  drop constraint if exists register_category_mappings_register_type_check;

alter table if exists public.register_category_mappings
  add constraint register_category_mappings_register_type_check
  check (register_type in ('income', 'expense'));

alter table if exists public.register_category_mappings
  drop constraint if exists register_category_mappings_description_pattern_check;

alter table if exists public.register_category_mappings
  add constraint register_category_mappings_description_pattern_check
  check (description_pattern is null or length(trim(description_pattern)) > 0);

alter table if exists public.register_category_mappings
  drop constraint if exists register_category_mappings_priority_check;

alter table if exists public.register_category_mappings
  add constraint register_category_mappings_priority_check
  check (priority >= 0);

alter table if exists public.register_category_mappings
  drop constraint if exists register_category_mappings_has_dimension;

alter table if exists public.register_category_mappings
  add constraint register_category_mappings_has_dimension check (
    account_id is not null
    or income_stream_id is not null
    or supplier_id is not null
    or donor_id is not null
    or lettings_hirer_id is not null
    or payroll_component is not null
    or fund_id is not null
    or bank_rule_id is not null
    or description_pattern is not null
  );

drop trigger if exists trg_register_category_mappings_touch_updated_at
  on public.register_category_mappings;
create trigger trg_register_category_mappings_touch_updated_at
  before update on public.register_category_mappings
  for each row execute function public.touch_updated_at();

create index if not exists idx_register_category_mappings_org_type_priority
  on public.register_category_mappings (organisation_id, register_type, priority, created_at desc);

create index if not exists idx_register_category_mappings_org_description
  on public.register_category_mappings (organisation_id, register_type, lower(description_pattern))
  where description_pattern is not null;

create unique index if not exists idx_register_category_mappings_unique_description_rule
  on public.register_category_mappings (
    organisation_id,
    register_type,
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(donor_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(description_pattern, '')
  )
  where description_pattern is not null;
