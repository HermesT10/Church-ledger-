-- Repair drift: ensure signup location columns on organisations exist even if 00048
-- did not run or the database was restored from an older snapshot.

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'United Kingdom';

COMMENT ON COLUMN public.organisations.city IS 'Organisation city (signup / settings).';
COMMENT ON COLUMN public.organisations.country IS 'Organisation country (signup / settings).';
