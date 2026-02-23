-- 00048_signup_fields.sql
-- Add phone to profiles, city/country to organisations for signup flow.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'United Kingdom';

-- Update the auth trigger to also populate phone from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, phone)
  VALUES (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'phone'
  );
  RETURN new;
END;
$$;
