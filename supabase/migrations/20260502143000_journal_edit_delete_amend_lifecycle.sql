-- Journal lifecycle support for safe reversal/amendment workflows.
-- Posted ledger lines remain immutable; corrections happen through linked journals.

alter type public.journal_status add value if not exists 'reversed';
alter type public.journal_status add value if not exists 'correcting';
alter type public.journal_status add value if not exists 'voided';

alter table public.journals
  add column if not exists posted_by uuid references public.profiles(id) on delete set null,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists reversal_of_journal_id uuid references public.journals(id) on delete set null,
  add column if not exists corrected_by_journal_id uuid references public.journals(id) on delete set null,
  add column if not exists original_journal_id uuid references public.journals(id) on delete set null,
  add column if not exists reversal_journal_id uuid references public.journals(id) on delete set null,
  add column if not exists replacement_journal_id uuid references public.journals(id) on delete set null,
  add column if not exists amendment_reason text,
  add column if not exists amended_by uuid references public.profiles(id) on delete set null,
  add column if not exists amended_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id) on delete set null,
  add column if not exists void_reason text,
  add column if not exists locked_period_id uuid references public.financial_periods(id) on delete set null;

update public.journals
   set reversal_of_journal_id = coalesce(reversal_of_journal_id, reversal_of)
 where reversal_of is not null;

update public.journals
   set corrected_by_journal_id = coalesce(corrected_by_journal_id, reversed_by),
       reversed_at = coalesce(reversed_at, posted_at)
 where reversed_by is not null;

create index if not exists idx_journals_reversal_of_journal_id
  on public.journals (reversal_of_journal_id)
  where reversal_of_journal_id is not null;

create index if not exists idx_journals_original_journal_id
  on public.journals (original_journal_id)
  where original_journal_id is not null;

create index if not exists idx_journals_replacement_journal_id
  on public.journals (replacement_journal_id)
  where replacement_journal_id is not null;

create index if not exists idx_journals_corrected_by_journal_id
  on public.journals (corrected_by_journal_id)
  where corrected_by_journal_id is not null;

create or replace function public.block_posted_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.demo_batch_id is not null then
      return old;
    end if;

    if old.status::text = 'posted' then
      raise exception 'Cannot delete a posted %. Use reversal or amendment instead.', tg_table_name;
    end if;

    return old;
  end if;

  if old.status::text = 'posted' then
    if tg_table_name = 'journals' then
      if new.status::text = old.status::text
         and new.journal_date = old.journal_date
         and new.memo is not distinct from old.memo
         and new.reference is not distinct from old.reference
         and new.posted_at is not distinct from old.posted_at
         and new.reversal_of is not distinct from old.reversal_of
         and new.reversal_of_journal_id is not distinct from old.reversal_of_journal_id
         and new.attachment_url is not distinct from old.attachment_url
      then
        return new;
      end if;
    end if;

    raise exception 'Cannot update a posted %. Use Amend Journal to create a correction.', tg_table_name;
  end if;

  return new;
end;
$$;

create or replace function public.get_journal_delete_dependency_preview(target_journal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_total integer := 0;
  v_count integer := 0;
begin
  if to_regclass('public.bank_reconciliation_matches') is not null then
    select count(*) into v_count
      from public.bank_reconciliation_matches
     where journal_id = target_journal_id;
    if v_count > 0 then
      v_counts := jsonb_set(v_counts, '{bank_reconciliation_matches}', to_jsonb(v_count), true);
      v_total := v_total + v_count;
    end if;
  end if;

  if to_regclass('public.bank_lines') is not null then
    select count(*) into v_count
      from public.bank_lines
     where posted_journal_id = target_journal_id;
    if v_count > 0 then
      v_counts := jsonb_set(v_counts, '{bank_lines}', to_jsonb(v_count), true);
      v_total := v_total + v_count;
    end if;
  end if;

  if to_regclass('public.manual_transactions') is not null then
    select count(*) into v_count
      from public.manual_transactions
     where posted_journal_id = target_journal_id;
    if v_count > 0 then
      v_counts := jsonb_set(v_counts, '{manual_transactions}', to_jsonb(v_count), true);
      v_total := v_total + v_count;
    end if;
  end if;

  return jsonb_build_object('total', v_total, 'counts', v_counts, 'canDelete', v_total = 0);
end;
$$;

revoke all on function public.get_journal_delete_dependency_preview(uuid) from anon, authenticated;
