-- 00057_phase5_saas_foundation.sql
-- Phase 5 SaaS readiness foundations:
-- - active organisation persistence
-- - richer organisation branding/contact metadata
-- - billing/subscription scaffold
-- - product analytics events

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_organisation_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL;

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS charity_number text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.organisation_settings
  ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS report_brand_name text,
  ADD COLUMN IF NOT EXISTS report_footer_text text;

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  seat_limit integer,
  monthly_price_pence bigint NOT NULL DEFAULT 0,
  annual_price_pence bigint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organisation_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL UNIQUE REFERENCES public.organisations(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'trial',
  billing_email text,
  seat_count integer NOT NULL DEFAULT 1,
  seat_limit integer,
  trial_ends_at timestamptz,
  grace_period_ends_at timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organisation_subscriptions_status_valid CHECK (
    status IN ('trial', 'active', 'past_due', 'grace_period', 'cancelled', 'suspended')
  )
);

CREATE TABLE IF NOT EXISTS public.subscription_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  feature_code text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  limit_value integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, feature_code)
);

CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  module_key text,
  path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_active_organisation_id
  ON public.profiles(active_organisation_id);

CREATE INDEX IF NOT EXISTS idx_product_events_org_created_at
  ON public.product_events(organisation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_event_type_created_at
  ON public.product_events(event_type, created_at DESC);

ALTER TABLE public.organisation_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view subscriptions" ON public.organisation_subscriptions;
CREATE POLICY "org members can view subscriptions"
  ON public.organisation_subscriptions
  FOR SELECT
  USING (public.is_org_member(organisation_id));

DROP POLICY IF EXISTS "org admins can update subscriptions" ON public.organisation_subscriptions;
CREATE POLICY "org admins can update subscriptions"
  ON public.organisation_subscriptions
  FOR UPDATE
  USING (public.is_org_admin(organisation_id))
  WITH CHECK (public.is_org_admin(organisation_id));

DROP POLICY IF EXISTS "org members can log product events" ON public.product_events;
CREATE POLICY "org members can log product events"
  ON public.product_events
  FOR INSERT
  WITH CHECK (
    public.is_org_member(organisation_id)
    AND user_id = auth.uid()
  );

INSERT INTO public.subscription_plans (code, name, description, seat_limit, monthly_price_pence, annual_price_pence, metadata)
VALUES
  (
    'starter',
    'Starter',
    'Good for a single church finance team getting started.',
    5,
    0,
    0,
    '{"reports": true, "support_console": false}'::jsonb
  ),
  (
    'growth',
    'Growth',
    'Adds more seats, richer reporting, and faster support workflows.',
    20,
    9900,
    99900,
    '{"reports": true, "support_console": true, "branding": true}'::jsonb
  ),
  (
    'enterprise',
    'Enterprise',
    'For multi-campus organisations needing more controls and tailored support.',
    NULL,
    24900,
    249900,
    '{"reports": true, "support_console": true, "branding": true, "priority_support": true}'::jsonb
  )
ON CONFLICT (code) DO NOTHING;
