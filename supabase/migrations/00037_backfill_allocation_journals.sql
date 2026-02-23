-- 00037_backfill_allocation_journals.sql
-- Phase 4: Migrate existing bank allocations to the General Ledger.
-- Creates posted journals for every allocation that doesn't already have one.
-- Only processes allocations where the bank account has a linked_account_id.

-- This is a data migration. It creates journals with source_type='bank_migration'.

DO $$
DECLARE
  alloc_row RECORD;
  new_journal_id uuid;
  bank_acct_name text;
  bl_desc text;
  bl_date date;
  amount_abs bigint;
  is_income boolean;
BEGIN
  FOR alloc_row IN
    SELECT
      a.id AS alloc_id,
      a.organisation_id,
      a.bank_line_id,
      a.account_id,
      a.fund_id,
      a.supplier_id,
      a.amount_pence,
      a.created_by,
      bl.txn_date,
      bl.description AS bl_description,
      bl.bank_account_id,
      ba.linked_account_id,
      ba.name AS bank_name
    FROM public.allocations a
    JOIN public.bank_lines bl ON bl.id = a.bank_line_id
    JOIN public.bank_accounts ba ON ba.id = bl.bank_account_id
    WHERE ba.linked_account_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.journals j
        WHERE j.source_type = 'bank'
          AND j.source_id = a.bank_line_id
          AND j.organisation_id = a.organisation_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.journals j
        WHERE j.source_type = 'bank_migration'
          AND j.source_id = a.bank_line_id
          AND j.organisation_id = a.organisation_id
      )
  LOOP
    amount_abs := ABS(alloc_row.amount_pence);
    is_income := alloc_row.amount_pence > 0;
    bl_desc := COALESCE(alloc_row.bl_description, '');
    bl_date := COALESCE(alloc_row.txn_date, CURRENT_DATE);
    bank_acct_name := COALESCE(alloc_row.bank_name, 'Bank');

    -- Create posted journal
    INSERT INTO public.journals (
      organisation_id, journal_date, memo, reference, status,
      source_type, source_id, created_by
    ) VALUES (
      alloc_row.organisation_id,
      bl_date,
      LEFT('Bank migration: ' || bl_desc, 255),
      'MIG-' || UPPER(LEFT(alloc_row.bank_line_id::text, 8)),
      'posted',
      'bank_migration',
      alloc_row.bank_line_id,
      alloc_row.created_by
    )
    RETURNING id INTO new_journal_id;

    -- Create balanced journal lines
    IF is_income THEN
      -- Income: Dr Bank, Cr Account
      INSERT INTO public.journal_lines (journal_id, organisation_id, account_id, fund_id, supplier_id, description, debit_pence, credit_pence) VALUES
        (new_journal_id, alloc_row.organisation_id, alloc_row.linked_account_id, alloc_row.fund_id, NULL, bank_acct_name || ' deposit', amount_abs, 0),
        (new_journal_id, alloc_row.organisation_id, alloc_row.account_id, alloc_row.fund_id, alloc_row.supplier_id, COALESCE(bl_desc, 'Bank income'), 0, amount_abs);
    ELSE
      -- Expense: Dr Account, Cr Bank
      INSERT INTO public.journal_lines (journal_id, organisation_id, account_id, fund_id, supplier_id, description, debit_pence, credit_pence) VALUES
        (new_journal_id, alloc_row.organisation_id, alloc_row.account_id, alloc_row.fund_id, alloc_row.supplier_id, COALESCE(bl_desc, 'Bank expense'), amount_abs, 0),
        (new_journal_id, alloc_row.organisation_id, alloc_row.linked_account_id, alloc_row.fund_id, NULL, bank_acct_name || ' payment', 0, amount_abs);
    END IF;
  END LOOP;
END $$;
