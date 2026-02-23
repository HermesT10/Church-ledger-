-- 00007_journals.sql
-- Double-entry journals: journal_status enum, journals table, journal_lines table,
-- CHECK constraints, RLS policies, journal_is_balanced() function, posting trigger.

-- ============================================================
-- 1. Enum
-- ============================================================

create type public.journal_status as enum ('draft', 'approved', 'posted');

-- ============================================================
-- 2. Tables
-- ============================================================

create table public.journals (
  id              uuid                primary key default gen_random_uuid(),
  organisation_id uuid                not null references public.organisations(id) on delete cascade,
  journal_date    date                not null,
  memo            text,
  status          public.journal_status not null default 'draft',
  posted_at       timestamptz,
  created_by      uuid                references public.profiles(id),
  created_at      timestamptz         not null default now()
);

create table public.journal_lines (
  id              uuid        primary key default gen_random_uuid(),
  journal_id      uuid        not null references public.journals(id) on delete cascade,
  organisation_id uuid        not null references public.organisations(id) on delete cascade,
  account_id      uuid        not null references public.accounts(id),
  fund_id         uuid        references public.funds(id),
  description     text,
  debit_pence     bigint      not null default 0,
  credit_pence    bigint      not null default 0,
  created_at      timestamptz not null default now(),

  -- A line's amounts must be non-negative
  constraint journal_lines_debit_non_negative  check (debit_pence  >= 0),
  constraint journal_lines_credit_non_negative check (credit_pence >= 0),
  -- A line is either a debit or a credit, never both
  constraint journal_lines_single_side         check (not (debit_pence > 0 and credit_pence > 0))
);

-- ============================================================
-- 3. Enable RLS
-- ============================================================

alter table public.journals      enable row level security;
alter table public.journal_lines enable row level security;

-- ============================================================
-- 4. RLS Policies – journals
-- ============================================================

-- SELECT: any org member can read
create policy journals_select_member on public.journals
  for select using (public.is_org_member(organisation_id));

-- INSERT: treasurer/admin, new rows must be draft
create policy journals_insert_treasurer_admin on public.journals
  for insert with check (
    public.is_org_treasurer_or_admin(organisation_id)
    and status = 'draft'
  );

-- UPDATE: treasurer/admin can update drafts; WITH CHECK is relaxed so status can transition
create policy journals_update_treasurer_admin on public.journals
  for update
  using  (public.is_org_treasurer_or_admin(organisation_id) and status = 'draft')
  with check (public.is_org_treasurer_or_admin(organisation_id));

-- DELETE: treasurer/admin, only drafts
create policy journals_delete_treasurer_admin on public.journals
  for delete using (
    public.is_org_treasurer_or_admin(organisation_id)
    and status = 'draft'
  );

-- ============================================================
-- 5. RLS Policies – journal_lines
-- ============================================================

-- SELECT: any org member can read
create policy jlines_select_member on public.journal_lines
  for select using (public.is_org_member(organisation_id));

-- INSERT: treasurer/admin AND parent journal must be draft
create policy jlines_insert_treasurer_admin on public.journal_lines
  for insert with check (
    public.is_org_treasurer_or_admin(organisation_id)
    and (select status from public.journals where id = journal_id) = 'draft'
  );

-- UPDATE: treasurer/admin AND parent journal must be draft
create policy jlines_update_treasurer_admin on public.journal_lines
  for update
  using (
    public.is_org_treasurer_or_admin(organisation_id)
    and (select status from public.journals where id = journal_id) = 'draft'
  )
  with check (
    public.is_org_treasurer_or_admin(organisation_id)
    and (select status from public.journals where id = journal_id) = 'draft'
  );

-- DELETE: treasurer/admin AND parent journal must be draft
create policy jlines_delete_treasurer_admin on public.journal_lines
  for delete using (
    public.is_org_treasurer_or_admin(organisation_id)
    and (select status from public.journals where id = journal_id) = 'draft'
  );

-- ============================================================
-- 6. journal_is_balanced() function
-- ============================================================

create or replace function public.journal_is_balanced(p_journal_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select sum(debit_pence) = sum(credit_pence)
             and count(*) >= 2
      from public.journal_lines
      where journal_id = p_journal_id
    ),
    false
  );
$$;

revoke all on function public.journal_is_balanced(uuid) from public;
grant execute on function public.journal_is_balanced(uuid) to authenticated;

-- ============================================================
-- 7. Trigger: prevent posting unbalanced journals
-- ============================================================

create or replace function public.handle_journal_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only fire when status is changing to 'posted'
  if NEW.status = 'posted' and (OLD.status is distinct from 'posted') then
    if not public.journal_is_balanced(NEW.id) then
      raise exception 'Cannot post journal: debits and credits are not balanced (or fewer than 2 lines).';
    end if;
    NEW.posted_at := now();
  end if;
  return NEW;
end;
$$;

revoke all on function public.handle_journal_post() from public;

create trigger trg_journal_post
  before update on public.journals
  for each row
  execute function public.handle_journal_post();
