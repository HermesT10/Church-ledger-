alter table public.month_end_reviews enable row level security;

drop policy if exists "org members can view month end reviews" on public.month_end_reviews;
create policy "org members can view month end reviews"
  on public.month_end_reviews
  for select
  using (public.is_org_member(organisation_id));

drop policy if exists "org finance users can insert month end reviews" on public.month_end_reviews;
create policy "org finance users can insert month end reviews"
  on public.month_end_reviews
  for insert
  with check (
    public.is_org_treasurer_or_admin(organisation_id)
    and created_by = auth.uid()
  );

drop policy if exists "org finance users can update month end reviews" on public.month_end_reviews;
create policy "org finance users can update month end reviews"
  on public.month_end_reviews
  for update
  using (public.is_org_treasurer_or_admin(organisation_id))
  with check (public.is_org_treasurer_or_admin(organisation_id));
