-- 00066_private_financial_evidence.sql
-- Make financial evidence private and scope Storage access by organisation path.

update storage.buckets
   set public = false
 where id = 'financial-evidence';

drop policy if exists financial_evidence_public_read on storage.objects;
drop policy if exists financial_evidence_member_insert on storage.objects;
drop policy if exists financial_evidence_member_update on storage.objects;
drop policy if exists financial_evidence_member_select on storage.objects;
drop policy if exists financial_evidence_member_delete on storage.objects;

create policy financial_evidence_member_select
on storage.objects for select
using (
  bucket_id = 'financial-evidence'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

create policy financial_evidence_member_insert
on storage.objects for insert
with check (
  bucket_id = 'financial-evidence'
  and public.is_org_treasurer_or_admin(((storage.foldername(name))[1])::uuid)
);

create policy financial_evidence_member_update
on storage.objects for update
using (
  bucket_id = 'financial-evidence'
  and public.is_org_treasurer_or_admin(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'financial-evidence'
  and public.is_org_treasurer_or_admin(((storage.foldername(name))[1])::uuid)
);

create policy financial_evidence_member_delete
on storage.objects for delete
using (
  bucket_id = 'financial-evidence'
  and public.is_org_treasurer_or_admin(((storage.foldername(name))[1])::uuid)
);
