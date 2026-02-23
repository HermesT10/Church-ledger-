import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getTrialBalance } from '@/lib/reports/glReports';
import { TrialBalanceClient } from './trial-balance-client';

export default async function TrialBalancePage() {
  const { orgId } = await getActiveOrg();
  const today = new Date().toISOString().slice(0, 10);

  const [reportRes, fundsRes] = await Promise.all([
    getTrialBalance({ asOfDate: today }),
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
    <TrialBalanceClient
      initialReport={reportRes.data}
      funds={funds}
      error={reportRes.error}
    />
  );
}
