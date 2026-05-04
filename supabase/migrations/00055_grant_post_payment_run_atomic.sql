-- 00055_grant_post_payment_run_atomic.sql
-- Single-statement migration to avoid Supabase CLI parser issues.

grant execute on function public.post_payment_run_atomic(uuid, uuid, uuid, uuid, text) to authenticated;
