-- Review comments for professional trustee reporting packs.

create table if not exists public.report_review_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  report_version_id uuid not null references public.report_versions(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  visibility text not null default 'internal',
  body text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint report_review_comments_visibility_check check (visibility in ('internal', 'trustee')),
  constraint report_review_comments_body_check check (length(trim(body)) > 0)
);

create index if not exists report_review_comments_workspace_report_idx
  on public.report_review_comments (workspace_id, report_version_id, created_at desc);

alter table public.report_review_comments enable row level security;

drop policy if exists report_review_comments_select on public.report_review_comments;
create policy report_review_comments_select
  on public.report_review_comments
  for select
  using (
    public.is_org_treasurer_or_admin(workspace_id)
    or (
      public.is_org_member(workspace_id)
      and visibility = 'trustee'
      and exists (
        select 1
        from public.report_versions rv
        where rv.id = report_review_comments.report_version_id
          and rv.workspace_id = report_review_comments.workspace_id
          and rv.status in ('approved', 'exported')
      )
    )
  );

drop policy if exists report_review_comments_insert_treasurer_admin on public.report_review_comments;
create policy report_review_comments_insert_treasurer_admin
  on public.report_review_comments
  for insert
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists report_review_comments_update_treasurer_admin on public.report_review_comments;
create policy report_review_comments_update_treasurer_admin
  on public.report_review_comments
  for update
  using (public.is_org_treasurer_or_admin(workspace_id))
  with check (public.is_org_treasurer_or_admin(workspace_id));

drop policy if exists report_review_comments_delete_admin on public.report_review_comments;
create policy report_review_comments_delete_admin
  on public.report_review_comments
  for delete
  using (public.is_org_admin(workspace_id));
