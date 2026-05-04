-- Global financial clean slate (manual invocation ONLY).
-- Does not delete organisations, memberships, profiles, or auth users.
-- Run from Supabase SQL editor (service role session), e.g.:
--   select public.admin_global_clean_financial_data(false, false);
--
-- Arguments match per-workspace reset: delete_documents, delete_report_exports.

create or replace function public.admin_global_clean_financial_data(
  delete_documents boolean default false,
  delete_report_exports boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org record;
  one jsonb;
  results jsonb := '[]'::jsonb;
  n int := 0;
begin
  for org in select id from public.organisations order by id loop
    one := public.run_workspace_data_delete(
      org.id,
      'financial',
      delete_documents,
      delete_report_exports,
      null::uuid
    );
    results := results || jsonb_build_array(
      jsonb_build_object('workspace_id', org.id, 'summary', one)
    );
    n := n + 1;
  end loop;

  return jsonb_build_object(
    'workspace_count', n,
    'delete_documents', delete_documents,
    'delete_report_exports', delete_report_exports,
    'results', results
  );
exception
  when others then
    raise;
end;
$$;

revoke all on function public.admin_global_clean_financial_data(boolean, boolean) from public;
revoke all on function public.admin_global_clean_financial_data(boolean, boolean) from anon;
revoke all on function public.admin_global_clean_financial_data(boolean, boolean) from authenticated;
