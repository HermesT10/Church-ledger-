-- 00076_gift_aid_declaration_documents.sql
-- Production donor/declaration workflow hardening: draft/invalid statuses,
-- HMRC-style single donation form fields, generated/signed declaration
-- documents, and private org-scoped Gift Aid storage.

do $$
begin
  begin
    alter type public.gift_aid_declaration_status add value 'draft';
  exception
    when duplicate_object then null;
  end;

  begin
    alter type public.gift_aid_declaration_status add value 'invalid';
  exception
    when duplicate_object then null;
  end;
end $$;

alter table public.gift_aid_declarations
  add column if not exists donation_amount_pence bigint,
  add column if not exists charity_name text,
  add column if not exists donor_title_snapshot text,
  add column if not exists donor_first_name_or_initial_snapshot text,
  add column if not exists donor_surname_snapshot text,
  add column if not exists donor_full_home_address_snapshot text,
  add column if not exists donor_postcode_snapshot text,
  add column if not exists signed_date date,
  add column if not exists taxpayer_confirmation boolean not null default false,
  add column if not exists declaration_wording text,
  add column if not exists donor_notification_notes text,
  add column if not exists generated_pdf_storage_path text,
  add column if not exists generated_pdf_created_at timestamptz,
  add column if not exists generated_pdf_created_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'gift_aid_declarations_single_donation_amount_check'
      and conrelid = 'public.gift_aid_declarations'::regclass
  ) then
    alter table public.gift_aid_declarations
      add constraint gift_aid_declarations_single_donation_amount_check
      check (
        declaration_type <> 'single'
        or donation_amount_pence is null
        or donation_amount_pence > 0
      );
  end if;
end $$;

create index if not exists idx_gift_aid_declarations_org_donor_status
  on public.gift_aid_declarations (organisation_id, donor_id, status);

create table if not exists public.gift_aid_declaration_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  declaration_id uuid not null references public.gift_aid_declarations(id) on delete cascade,
  donor_id uuid not null references public.donors(id) on delete cascade,
  document_type text not null
    check (document_type in ('signed_declaration', 'generated_pdf')),
  storage_bucket text not null default 'gift-aid',
  storage_path text not null,
  file_name text not null,
  content_type text,
  file_size bigint check (file_size is null or file_size > 0),
  sha256 text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create index if not exists idx_gift_aid_declaration_documents_org
  on public.gift_aid_declaration_documents (organisation_id, uploaded_at desc);

create index if not exists idx_gift_aid_declaration_documents_declaration
  on public.gift_aid_declaration_documents (declaration_id, uploaded_at desc);

create index if not exists idx_gift_aid_declaration_documents_current
  on public.gift_aid_declaration_documents (organisation_id, declaration_id, document_type)
  where is_current = true;

alter table public.gift_aid_declaration_documents enable row level security;
alter table public.gift_aid_declaration_documents force row level security;

drop policy if exists gift_aid_declaration_documents_select_member on public.gift_aid_declaration_documents;
create policy gift_aid_declaration_documents_select_member
  on public.gift_aid_declaration_documents
  for select using (public.is_org_member(organisation_id));

drop policy if exists gift_aid_declaration_documents_insert_writer on public.gift_aid_declaration_documents;
create policy gift_aid_declaration_documents_insert_writer
  on public.gift_aid_declaration_documents
  for insert with check (public.is_org_treasurer_or_admin(organisation_id));

drop policy if exists gift_aid_declaration_documents_update_writer on public.gift_aid_declaration_documents;
create policy gift_aid_declaration_documents_update_writer
  on public.gift_aid_declaration_documents
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));

drop policy if exists gift_aid_declaration_documents_delete_writer on public.gift_aid_declaration_documents;
create policy gift_aid_declaration_documents_delete_writer
  on public.gift_aid_declaration_documents
  for delete using (public.is_org_treasurer_or_admin(organisation_id));

insert into storage.buckets (id, name, public)
values ('gift-aid', 'gift-aid', false)
on conflict (id) do update set public = false;

drop policy if exists gift_aid_member_select on storage.objects;
drop policy if exists gift_aid_member_insert on storage.objects;
drop policy if exists gift_aid_member_update on storage.objects;
drop policy if exists gift_aid_member_delete on storage.objects;

create policy gift_aid_member_select
on storage.objects for select
using (
  bucket_id = 'gift-aid'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

create policy gift_aid_member_insert
on storage.objects for insert
with check (
  bucket_id = 'gift-aid'
  and public.is_org_treasurer_or_admin(((storage.foldername(name))[1])::uuid)
);

create policy gift_aid_member_update
on storage.objects for update
using (
  bucket_id = 'gift-aid'
  and public.is_org_treasurer_or_admin(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'gift-aid'
  and public.is_org_treasurer_or_admin(((storage.foldername(name))[1])::uuid)
);

create policy gift_aid_member_delete
on storage.objects for delete
using (
  bucket_id = 'gift-aid'
  and public.is_org_treasurer_or_admin(((storage.foldername(name))[1])::uuid)
);
