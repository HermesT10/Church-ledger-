import { getActiveOrg } from '@/lib/org';
import { getGiftAidSummaryReport } from '@/lib/reports/summaryReports';
import { GiftAidSummaryClient } from './gift-aid-summary-client';

export default async function GiftAidSummaryPage() {
  const { orgId } = await getActiveOrg();
  const { data, error } = await getGiftAidSummaryReport({ organisationId: orgId });

  return <GiftAidSummaryClient initialData={data} error={error} />;
}
