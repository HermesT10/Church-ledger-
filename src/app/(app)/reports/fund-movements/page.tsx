import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getFundMovementsReport } from '@/lib/reports/actions';
import { FundMovementsClient } from './fund-movements-client';

export default async function FundMovementsPage() {
  const { orgId } = await getActiveOrg();
  const currentYear = new Date().getFullYear();

  const [reportRes, fundsRes] = await Promise.all([
    getFundMovementsReport({
      organisationId: orgId,
      year: currentYear,
      mode: 'YTD',
    }),
    (async () => {
      const supabase = await createClient();
      return supabase
        .from('funds')
        .select('id, name, type')
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .order('name');
    })(),
  ]);

  const funds = (fundsRes.data ?? []) as {
    id: string;
    name: string;
    type: string;
  }[];

  return (
    <FundMovementsClient
      initialData={reportRes.data}
      orgId={orgId}
      funds={funds}
      defaultYear={currentYear}
      error={reportRes.error}
    />
  );
}
