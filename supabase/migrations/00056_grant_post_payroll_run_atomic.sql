-- 00056_grant_post_payroll_run_atomic.sql
-- Single-statement migration to avoid Supabase CLI parser issues.

grant execute on function public.post_payroll_run_atomic(uuid, uuid, uuid, text) to authenticated;
