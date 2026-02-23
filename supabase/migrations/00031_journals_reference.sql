-- 00031_journals_reference.sql
-- Add reference column to journals and no-zero constraint on journal_lines

-- 1. Add reference column for short identifiers (e.g. JNL-001)
ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS reference text;

-- 2. Prevent zero-value lines (both debit and credit are 0)
-- A line must have at least one non-zero amount
ALTER TABLE public.journal_lines
  ADD CONSTRAINT journal_lines_no_zero
  CHECK (debit_pence > 0 OR credit_pence > 0);

-- 3. Index for reference lookups
CREATE INDEX IF NOT EXISTS idx_journals_reference
  ON public.journals (organisation_id, reference)
  WHERE reference IS NOT NULL;
