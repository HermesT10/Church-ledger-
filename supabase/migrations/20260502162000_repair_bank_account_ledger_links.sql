-- Repair active bank account -> Chart of Accounts links.
--
-- Canonical link field: public.bank_accounts.linked_account_id.
-- The linked account must belong to the same organisation and be an active
-- asset account suitable for direct bank/cash posting.

do $$
declare
  v_bank record;
  v_existing_account_id uuid;
  v_created_account_id uuid;
  v_linked_existing integer := 0;
  v_created integer := 0;
  v_failed integer := 0;
  v_code text;
begin
  -- Null out broken links first so the repair loop handles them uniformly.
  update public.bank_accounts ba
     set linked_account_id = null
   where ba.linked_account_id is not null
     and coalesce(ba.status, case when coalesce(ba.is_active, true) then 'active' else 'archived' end) = 'active'
     and coalesce(ba.is_active, true) = true
     and not exists (
       select 1
         from public.accounts a
        where a.id = ba.linked_account_id
          and a.organisation_id = ba.organisation_id
          and a.type::text = 'asset'
          and coalesce(a.is_active, true) = true
          and coalesce(a.is_archived, false) = false
          and a.archived_at is null
          and (
            a.subtype is null
            or lower(a.subtype) in ('bank', 'cash', 'current', 'current_account', 'savings', 'savings_account', 'clearing')
          )
     );

  for v_bank in
    select ba.*
      from public.bank_accounts ba
     where ba.linked_account_id is null
       and coalesce(ba.status, case when coalesce(ba.is_active, true) then 'active' else 'archived' end) = 'active'
       and coalesce(ba.is_active, true) = true
  loop
    v_existing_account_id := null;
    v_created_account_id := null;

    select a.id
      into v_existing_account_id
      from public.accounts a
     where a.organisation_id = v_bank.organisation_id
       and a.type::text = 'asset'
       and coalesce(a.is_active, true) = true
       and coalesce(a.is_archived, false) = false
       and a.archived_at is null
       and (
         a.subtype is null
         or lower(a.subtype) in ('bank', 'cash', 'current', 'current_account', 'savings', 'savings_account', 'clearing')
       )
       and (
         lower(btrim(a.name)) = lower(btrim(v_bank.name))
         or lower(regexp_replace(a.name, '[^a-zA-Z0-9]+', '', 'g')) = lower(regexp_replace(v_bank.name, '[^a-zA-Z0-9]+', '', 'g'))
       )
     order by a.created_at asc
     limit 1;

    if v_existing_account_id is not null then
      update public.bank_accounts
         set linked_account_id = v_existing_account_id
       where id = v_bank.id;

      v_linked_existing := v_linked_existing + 1;
    else
      v_code := 'BANK-' || upper(left(v_bank.id::text, 8));

      begin
        insert into public.accounts (
          organisation_id,
          code,
          name,
          type,
          is_active,
          subtype,
          normal_balance,
          allow_direct_posting,
          available_in_reconciliation
        )
        values (
          v_bank.organisation_id,
          v_code,
          v_bank.name,
          'asset'::public.account_type,
          true,
          'bank',
          'debit',
          true,
          true
        )
        returning id into v_created_account_id;

        update public.bank_accounts
           set linked_account_id = v_created_account_id
         where id = v_bank.id;

        v_created := v_created + 1;
      exception
        when unique_violation then
          -- Extremely unlikely with UUID-derived codes, but keep the migration
          -- repeatable if a manually created account already owns the code.
          insert into public.accounts (
            organisation_id,
            code,
            name,
            type,
            is_active,
            subtype,
            normal_balance,
            allow_direct_posting,
            available_in_reconciliation
          )
          values (
            v_bank.organisation_id,
            'BANK-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)),
            v_bank.name,
            'asset'::public.account_type,
            true,
            'bank',
            'debit',
            true,
            true
          )
          returning id into v_created_account_id;

          update public.bank_accounts
             set linked_account_id = v_created_account_id
           where id = v_bank.id;

          v_created := v_created + 1;
        when others then
          v_failed := v_failed + 1;
          raise warning 'Could not repair bank account ledger link for bank_account_id=%: %', v_bank.id, sqlerrm;
      end;
    end if;
  end loop;

  raise notice 'Bank account ledger link repair: linked_existing=%, created=%, failed=%',
    v_linked_existing,
    v_created,
    v_failed;
end $$;

comment on column public.bank_accounts.linked_account_id is
  'Canonical Chart of Accounts link for this operational bank account. Must reference a same-organisation active asset account for reconciliation and posting.';
