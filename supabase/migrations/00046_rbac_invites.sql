-- =====================================================================
-- 00046_rbac_invites.sql
-- Role-Based Access Control + Invite-Only Onboarding
-- =====================================================================

-- ============================================================
-- 1. Extend user_role enum with finance_user and viewer
-- ============================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'finance_user';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'viewer';

-- ============================================================
-- 2. Add status, invited_by, invited_at, joined_at to memberships
-- ============================================================

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'disabled')),
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS joined_at timestamptz;

-- Backfill existing rows: all existing memberships are active
UPDATE public.memberships
  SET joined_at = created_at
  WHERE joined_at IS NULL;

-- ============================================================
-- 3. Create organisation_invites table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organisation_invites (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  email           text        NOT NULL,
  role            public.user_role NOT NULL,
  token           text        UNIQUE NOT NULL,
  expires_at      timestamptz NOT NULL,
  created_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organisation_id, email)
);

ALTER TABLE public.organisation_invites ENABLE ROW LEVEL SECURITY;

-- Only org admins can manage invites
CREATE POLICY invites_select ON public.organisation_invites
  FOR SELECT USING (public.is_org_admin(organisation_id));

CREATE POLICY invites_insert ON public.organisation_invites
  FOR INSERT WITH CHECK (public.is_org_admin(organisation_id));

CREATE POLICY invites_delete ON public.organisation_invites
  FOR DELETE USING (public.is_org_admin(organisation_id));

-- Fast token lookup for accept-invite flow
CREATE INDEX IF NOT EXISTS idx_invites_token ON public.organisation_invites (token);

-- ============================================================
-- 4. Update is_org_member to require status = 'active'
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE organisation_id = org_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;

-- ============================================================
-- 5. Update is_org_admin to require status = 'active'
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE organisation_id = org_id
      AND user_id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;

-- ============================================================
-- 6. Update is_org_treasurer_or_admin to include finance_user
--    and require status = 'active'
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_treasurer_or_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE organisation_id = org_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'treasurer', 'finance_user')
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_treasurer_or_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_org_treasurer_or_admin(uuid) TO authenticated;

-- ============================================================
-- 7. Update is_org_auditor to require status = 'active'
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_auditor(org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE organisation_id = org_id
      AND user_id = auth.uid()
      AND role = 'auditor'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_auditor(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_org_auditor(uuid) TO authenticated;

-- ============================================================
-- 8. Index for status-filtered membership lookups
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_memberships_user_status
  ON public.memberships (user_id, status);
