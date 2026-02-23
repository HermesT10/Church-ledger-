-- 00015_dashboard_layout.sql
-- Add a JSONB column to profiles for storing dashboard widget layout preferences.
-- NULL means "use default layout". The JSONB stores an array of {id, visible} objects
-- where array order determines display order.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_layout jsonb;
