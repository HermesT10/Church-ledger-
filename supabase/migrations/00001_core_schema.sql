-- 00001_core_schema.sql
-- Core schema: user_role enum, profiles, organisations, memberships

-- 1. Enable pgcrypto (provides gen_random_uuid() on older Postgres versions)
create extension if not exists "pgcrypto";

-- 2. Enum: user roles
create type public.user_role as enum (
  'admin',
  'treasurer',
  'trustee_viewer',
  'auditor'
);

-- 3. Profiles (one per auth.users row)
create table public.profiles (
  id         uuid        primary key references auth.users(id) on delete cascade,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- 4. Organisations
create table public.organisations (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null default now()
);

-- 5. Memberships (links a user to an organisation with a role)
create table public.memberships (
  id              uuid            primary key default gen_random_uuid(),
  organisation_id uuid            not null references public.organisations(id) on delete cascade,
  user_id         uuid            not null references public.profiles(id) on delete cascade,
  role            public.user_role not null,
  created_at      timestamptz     not null default now(),

  unique (organisation_id, user_id)
);
