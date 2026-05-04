-- 00054_posting_function_grants.sql
-- Single-statement migration to avoid Supabase CLI parser issues.

grant execute on function public.post_bill_atomic(uuid, uuid, uuid, text) to authenticated;
