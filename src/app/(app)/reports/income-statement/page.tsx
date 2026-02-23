import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getIncomeExpenditureReport } from '@/lib/reports/actions';
import { IncomeStatementClient } from './income-statement-client';

export default async function IncomeStatementPage() {
  const { orgId, role } = await getActiveOrg();
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const [reportRes, fundsRes] = await Promise.all([
    getIncomeExpenditureReport({ organisationId: orgId, year, month }),
    (async () => {
      const supabase = await createClient();
      return supabase
        .from('funds')
        .select('id, name')
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .order('name');
    })(),
  ]);

  const funds = (fundsRes.data ?? []) as { id: string; name: string }[];

  return (
    <IncomeStatementClient
      initialData={reportRes.data}
      orgId={orgId}
      role={role}
      funds={funds}
      defaultYear={year}
      defaultMonth={month}
      error={reportRes.error}
    />
  );
}
