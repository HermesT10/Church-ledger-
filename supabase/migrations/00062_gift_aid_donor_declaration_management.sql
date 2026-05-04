-- 00062_gift_aid_donor_declaration_management.sql
-- Rich donor and declaration management for Gift Aid workflow.

alter table public.donors
  add column if not exists title text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists display_name text,
  add column if not exists house_name_or_number text,
  add column if not exists phone text,
  add column if not exists donor_reference_code text,
  add column if not exists notes text;

update public.donors
set display_name = coalesce(display_name, full_name)
where display_name is null;

update public.donors
set donor_reference_code = coalesce(donor_reference_code, reference_code)
where donor_reference_code is null
  and reference_code is not null;

create index if not exists idx_donors_workspace_display_name
  on public.donors (workspace_id, display_name);

create unique index if not exists uq_donors_workspace_donor_reference_code
  on public.donors (workspace_id, lower(donor_reference_code))
  where donor_reference_code is not null;

alter table public.gift_aid_declarations
  add column if not exists declaration_type text not null default 'enduring',
  add column if not exists covers_past_donations boolean not null default false,
  add column if not exists notes text;

create index if not exists idx_gift_aid_declarations_type
  on public.gift_aid_declarations (workspace_id, declaration_type);
