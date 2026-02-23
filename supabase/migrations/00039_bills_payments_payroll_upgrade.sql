-- 00039_bills_payments_payroll_upgrade.sql
-- Upgrade Bills, Payment Runs, and Payroll modules for full GL integration.

-- ============================================================
-- 1. Bills enhancements
-- ============================================================

-- Attachment URL for bill documents
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS attachment_url text;

-- Unique invoice number per supplier (prevent duplicate invoices)
-- Using a partial index since bill_number can be null
CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_unique_supplier_number
  ON public.bills (supplier_id, bill_number)
  WHERE bill_number IS NOT NULL;

-- ============================================================
-- 2. Payment Runs: store bank account at creation time
-- ============================================================

ALTER TABLE public.payment_runs
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_runs_bank_account
  ON public.payment_runs (bank_account_id)
  WHERE bank_account_id IS NOT NULL;

-- ============================================================
-- 3. Employees table (for per-employee payroll)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employees (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  full_name       text        NOT NULL,
  ni_number       text,
  tax_code        text,
  role            text,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT employees_name_not_empty CHECK (length(trim(full_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_org_name
  ON public.employees (organisation_id, full_name);

CREATE INDEX IF NOT EXISTS idx_employees_org
  ON public.employees (organisation_id);

-- RLS for employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY employees_select_member ON public.employees
  FOR SELECT USING (public.is_org_member(organisation_id));

CREATE POLICY employees_insert_admin ON public.employees
  FOR INSERT WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));

CREATE POLICY employees_update_admin ON public.employees
  FOR UPDATE
  USING (public.is_org_treasurer_or_admin(organisation_id))
  WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));

CREATE POLICY employees_delete_admin ON public.employees
  FOR DELETE USING (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- 4. Payroll lines (per-employee breakdown)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payroll_lines (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id  uuid        NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  gross_pence     bigint      NOT NULL DEFAULT 0,
  tax_pence       bigint      NOT NULL DEFAULT 0,
  pension_pence   bigint      NOT NULL DEFAULT 0,
  employer_ni_pence bigint    NOT NULL DEFAULT 0,
  net_pence       bigint      NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pl_gross_non_negative CHECK (gross_pence >= 0),
  CONSTRAINT pl_tax_non_negative CHECK (tax_pence >= 0),
  CONSTRAINT pl_pension_non_negative CHECK (pension_pence >= 0),
  CONSTRAINT pl_erni_non_negative CHECK (employer_ni_pence >= 0),
  CONSTRAINT pl_net_non_negative CHECK (net_pence >= 0)
);

CREATE INDEX IF NOT EXISTS idx_payroll_lines_run
  ON public.payroll_lines (payroll_run_id);

CREATE INDEX IF NOT EXISTS idx_payroll_lines_employee
  ON public.payroll_lines (employee_id);

-- RLS for payroll_lines
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY pl_select ON public.payroll_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payroll_runs pr
      WHERE pr.id = payroll_lines.payroll_run_id
        AND public.is_org_member(pr.organisation_id)
    )
  );

CREATE POLICY pl_insert ON public.payroll_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.payroll_runs pr
      WHERE pr.id = payroll_lines.payroll_run_id
        AND public.is_org_treasurer_or_admin(pr.organisation_id)
    )
  );

CREATE POLICY pl_delete ON public.payroll_lines
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.payroll_runs pr
      WHERE pr.id = payroll_lines.payroll_run_id
        AND public.is_org_treasurer_or_admin(pr.organisation_id)
    )
  );

-- ============================================================
-- 5. Approval events (audit trail for status transitions)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.approval_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  entity_type     text        NOT NULL,
  entity_id       uuid        NOT NULL,
  action          text        NOT NULL,
  performed_by    uuid        REFERENCES public.profiles(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ae_entity_type_valid CHECK (entity_type IN ('bill', 'payment_run', 'payroll_run')),
  CONSTRAINT ae_action_valid CHECK (action IN ('created', 'approved', 'rejected', 'posted', 'paid', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_approval_events_entity
  ON public.approval_events (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_approval_events_org
  ON public.approval_events (organisation_id);

-- RLS for approval_events
ALTER TABLE public.approval_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ae_select_member ON public.approval_events
  FOR SELECT USING (public.is_org_member(organisation_id));

CREATE POLICY ae_insert_admin ON public.approval_events
  FOR INSERT WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- 6. Add period_start / period_end to payroll_runs
-- ============================================================

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date;
