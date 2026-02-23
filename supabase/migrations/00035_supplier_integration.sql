-- 00035_supplier_integration.sql
-- Add supplier_id to allocations and journal_lines for expense tagging.
-- Create supplier_match_rules table for auto-suggest.

-- ============================================================
-- 1. Add supplier_id to allocations
-- ============================================================

ALTER TABLE public.allocations
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_supplier
  ON public.allocations (supplier_id)
  WHERE supplier_id IS NOT NULL;

-- ============================================================
-- 2. Add supplier_id to journal_lines
-- ============================================================

ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_journal_lines_supplier
  ON public.journal_lines (supplier_id)
  WHERE supplier_id IS NOT NULL;

-- ============================================================
-- 3. Create supplier_match_rules table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.supplier_match_rules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  supplier_id     uuid        NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  match_type      text        NOT NULL DEFAULT 'contains',
  pattern         text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT match_rules_type_valid CHECK (match_type IN ('contains')),
  CONSTRAINT match_rules_pattern_not_empty CHECK (length(trim(pattern)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_match_rules_org
  ON public.supplier_match_rules (organisation_id);

CREATE INDEX IF NOT EXISTS idx_match_rules_supplier
  ON public.supplier_match_rules (supplier_id);

-- ============================================================
-- 4. Enable RLS on supplier_match_rules
-- ============================================================

ALTER TABLE public.supplier_match_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY match_rules_select_member ON public.supplier_match_rules
  FOR SELECT USING (public.is_org_member(organisation_id));

CREATE POLICY match_rules_insert_treasurer_admin ON public.supplier_match_rules
  FOR INSERT WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));

CREATE POLICY match_rules_update_treasurer_admin ON public.supplier_match_rules
  FOR UPDATE
  USING (public.is_org_treasurer_or_admin(organisation_id))
  WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));

CREATE POLICY match_rules_delete_treasurer_admin ON public.supplier_match_rules
  FOR DELETE USING (public.is_org_treasurer_or_admin(organisation_id));
