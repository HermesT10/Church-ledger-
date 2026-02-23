import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getBalanceSheetReport } from '@/lib/reports/actions';
import { BalanceSheetClient } from './balance-sheet-client';

export default async function BalanceSheetPage() {
  const { orgId } = await getActiveOrg();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const [reportRes, fundsRes] = await Promise.all([
    getBalanceSheetReport({ organisationId: orgId, asOfDate: today }),
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
    <BalanceSheetClient
      initialData={reportRes.data}
      orgId={orgId}
      initialAsOfDate={today}
      funds={funds}
      error={reportRes.error}
    />
  );
}
