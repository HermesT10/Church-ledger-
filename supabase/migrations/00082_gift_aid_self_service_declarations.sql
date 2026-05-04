-- 00082_gift_aid_self_service_declarations.sql
-- Secure donor self-service Gift Aid declaration links and e-signature evidence.

create table if not exists public.gift_aid_declaration_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  donor_id uuid references public.donors(id) on delete cascade,
  declaration_id uuid references public.gift_aid_declarations(id) on delete set null,
  token_hash text not null,
  status text not null default 'active'
    check (status in ('active', 'used', 'expired', 'revoked')),
  expires_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gift_aid_declaration_links_donor_or_declaration
    check (donor_id is not null or declaration_id is not null)
);

create unique index if not exists uq_gift_aid_declaration_links_token_hash
  on public.gift_aid_declaration_links (token_hash);

create index if not exists idx_gift_aid_declaration_links_workspace
  on public.gift_aid_declaration_links (workspace_id, created_at desc);

create index if not exists idx_gift_aid_declaration_links_donor
  on public.gift_aid_declaration_links (workspace_id, donor_id, created_at desc)
  where donor_id is not null;

create index if not exists idx_gift_aid_declaration_links_active
  on public.gift_aid_declaration_links (workspace_id, expires_at)
  where status = 'active';

alter table public.gift_aid_declarations
  add column if not exists e_signature_name text,
  add column if not exists declaration_text_version text,
  add column if not exists submitted_ip inet,
  add column if not exists submitted_user_agent text,
  add column if not exists self_service_link_id uuid references public.gift_aid_declaration_links(id) on delete set null,
  add column if not exists generated_pdf_path text;

create index if not exists idx_gift_aid_declarations_self_service_link
  on public.gift_aid_declarations (self_service_link_id)
  where self_service_link_id is not null;

alter table public.gift_aid_declaration_links enable row level security;
alter table public.gift_aid_declaration_links force row level security;

drop policy if exists gift_aid_declaration_links_select_member on public.gift_aid_declaration_links;
create policy gift_aid_declaration_links_select_member
  on public.gift_aid_declaration_links
  for select using (public.is_org_member(workspace_id));

drop policy if exists gift_aid_declaration_links_insert_writer on public.gift_aid_declaration_links;
create policy gift_aid_declaration_links_insert_writer
  on public.gift_aid_declaration_links
  for insert with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_declaration_links_update_writer on public.gift_aid_declaration_links;
create policy gift_aid_declaration_links_update_writer
  on public.gift_aid_declaration_links
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists gift_aid_declaration_links_delete_writer on public.gift_aid_declaration_links;
create policy gift_aid_declaration_links_delete_writer
  on public.gift_aid_declaration_links
  for delete using (public.is_org_treasurer_or_admin(workspace_id));
