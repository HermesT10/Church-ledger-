-- 00049_settings_data_controls.sql
-- Bank account soft-delete (archive), data erasure requests, and RLS updates.

-- ============================================================
-- 1. Add archive columns to bank_accounts
-- ============================================================

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: sync status with is_active for existing rows
UPDATE public.bank_accounts
SET status = CASE WHEN is_active THEN 'active' ELSE 'archived' END;

-- Index for filtering active accounts
CREATE INDEX IF NOT EXISTS idx_bank_accounts_status
  ON public.bank_accounts (organisation_id, status)
  WHERE status = 'active';

-- ============================================================
-- 2. Create data_erasure_requests table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.data_erasure_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  requester_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope             text        NOT NULL CHECK (scope IN ('personal', 'church')),
  status            text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  resolved_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  notes             text
);

CREATE INDEX IF NOT EXISTS idx_data_erasure_requests_org
  ON public.data_erasure_requests (organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_data_erasure_requests_requester
  ON public.data_erasure_requests (requester_user_id);

-- ============================================================
-- 3. RLS for data_erasure_requests
-- ============================================================

ALTER TABLE public.data_erasure_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_erasure_requests_select ON public.data_erasure_requests
  FOR SELECT USING (
    requester_user_id = auth.uid()
    OR public.is_org_treasurer_or_admin(organisation_id)
  );

CREATE POLICY data_erasure_requests_insert ON public.data_erasure_requests
  FOR INSERT WITH CHECK (
    public.is_org_member(organisation_id)
    AND (
      (scope = 'personal')
      OR (scope = 'church' AND public.is_org_treasurer_or_admin(organisation_id))
    )
  );

CREATE POLICY data_erasure_requests_update ON public.data_erasure_requests
  FOR UPDATE
  USING (public.is_org_treasurer_or_admin(organisation_id))
  WITH CHECK (public.is_org_treasurer_or_admin(organisation_id));

-- ============================================================
-- 4. Update bank_accounts RLS for archive visibility
-- ============================================================

DROP POLICY IF EXISTS bank_accounts_select_member ON public.bank_accounts;

CREATE POLICY bank_accounts_select_member ON public.bank_accounts
  FOR SELECT USING (
    public.is_org_member(organisation_id)
    AND (
      status = 'active'
      OR public.is_org_treasurer_or_admin(organisation_id)
    )
  );
