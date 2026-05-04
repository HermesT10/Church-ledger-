-- 00065_harden_posted_journal_invariants.sql
-- Harden GL posting invariants (posted journals / journal lines).
-- post_bank_allocation_atomic lives in 00068_post_bank_allocation_atomic.sql (CLI batches large plpgsql reliably as its own migration).

create or replace function public.prevent_direct_posted_journal_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'posted' then
    raise exception 'Posted journals must be created as draft and posted through a controlled transition.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_direct_posted_journal_insert on public.journals;
create trigger trg_prevent_direct_posted_journal_insert
  before insert on public.journals
  for each row
  execute function public.prevent_direct_posted_journal_insert();

create or replace function public.prevent_posted_journal_line_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.journal_status;
  v_journal_id uuid;
begin
  v_journal_id := coalesce(new.journal_id, old.journal_id);

  select status
    into v_status
    from public.journals
   where id = v_journal_id;

  if v_status = 'posted' then
    raise exception 'Cannot change journal lines after a journal has been posted. Reverse or correct the journal instead.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_prevent_posted_journal_line_update on public.journal_lines;
create trigger trg_prevent_posted_journal_line_update
  before update on public.journal_lines
  for each row
  execute function public.prevent_posted_journal_line_mutation();

drop trigger if exists trg_prevent_posted_journal_line_delete on public.journal_lines;
create trigger trg_prevent_posted_journal_line_delete
  before delete on public.journal_lines
  for each row
  execute function public.prevent_posted_journal_line_mutation();
