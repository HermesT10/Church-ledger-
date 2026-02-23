-- 00012_user_preferences.sql
-- Add user preference columns to profiles.

-- ============================================================
-- 1. Add new columns
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS default_landing_page text NOT NULL DEFAULT 'dashboard',
  ADD COLUMN IF NOT EXISTS default_report_view text NOT NULL DEFAULT 'YTD',
  ADD COLUMN IF NOT EXISTS number_format text NOT NULL DEFAULT 'comma',
  ADD COLUMN IF NOT EXISTS date_format_preference text NOT NULL DEFAULT 'DD/MM/YYYY';

-- ============================================================
-- 2. CHECK constraints
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'profiles_theme_valid'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_theme_valid
      CHECK (theme IN ('light', 'dark', 'system'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'profiles_landing_page_valid'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_landing_page_valid
      CHECK (default_landing_page IN ('dashboard', 'trustee-snapshot'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'profiles_report_view_valid'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_report_view_valid
      CHECK (default_report_view IN ('MONTH', 'YTD'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'profiles_number_format_valid'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_number_format_valid
      CHECK (number_format IN ('comma', 'space'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'profiles_date_format_pref_valid'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_date_format_pref_valid
      CHECK (date_format_preference IN ('DD/MM/YYYY', 'MM/DD/YYYY'));
  END IF;
END $$;
