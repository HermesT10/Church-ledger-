-- 00036_gl_bank_allocation.sql
-- Phase 1: Make bank allocations post to the General Ledger.
-- Adds linked_account_id to bank_accounts, source tracking to journals.

-- ============================================================
-- 1. Link bank accounts to their Chart of Accounts asset account
-- ============================================================

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS linked_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_linked_account
  ON public.bank_accounts (linked_account_id)
  WHERE linked_account_id IS NOT NULL;

-- ============================================================
-- 2. Add source tracking to journals
-- ============================================================

ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid;

CREATE INDEX IF NOT EXISTS idx_journals_source
  ON public.journals (source_type, source_id)
  WHERE source_type IS NOT NULL;

COMMENT ON COLUMN public.journals.source_type IS 'Origin of the journal: bank, bill, payment, payroll, donation, giving, manual, bank_migration';
COMMENT ON COLUMN public.journals.source_id IS 'ID of the source record (bank_line, bill, payment_run, etc.)';
