import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getForecastReport } from '@/lib/reports/actions';
import { ForecastReportClient } from './forecast-report-client';

export default async function ForecastPage() {
  const { orgId } = await getActiveOrg();
  const currentYear = new Date().getFullYear();

  const [reportRes, fundsRes] = await Promise.all([
    getForecastReport({ organisationId: orgId }),
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
    <ForecastReportClient
      initialData={reportRes.data}
      orgId={orgId}
      initialYear={currentYear}
      funds={funds}
      error={reportRes.error}
    />
  );
}
