-- Demo data delete hits journal_lines on posted journals. trg_prevent_posted_journal_line_*
-- (00065) blocked those deletes; align with demo_batch_id behaviour on journals / lines (00027).

create or replace function public.prevent_posted_journal_line_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.journal_status;
  v_journal_id uuid;
  v_journal_demo_batch_id uuid;
begin
  v_journal_id := coalesce(new.journal_id, old.journal_id);

  select status, demo_batch_id
    into v_status, v_journal_demo_batch_id
    from public.journals
   where id = v_journal_id;

  if v_journal_demo_batch_id is not null then
    return coalesce(new, old);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') and old.demo_batch_id is not null then
    return coalesce(new, old);
  end if;

  if v_status = 'posted' then
    raise exception 'Cannot change journal lines after a journal has been posted. Reverse or correct the journal instead.';
  end if;

  return coalesce(new, old);
end;
$$;
