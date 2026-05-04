import { getActiveOrg } from '@/lib/org';
import { getBankReconciliationSummaryReport } from '@/lib/reports/summaryReports';
import { BankReconciliationSummaryClient } from './bank-reconciliation-summary-client';

export default async function BankReconciliationSummaryPage() {
  const { orgId } = await getActiveOrg();
  const { data, error } = await getBankReconciliationSummaryReport({
    organisationId: orgId,
  });

  return <BankReconciliationSummaryClient initialData={data} error={error} />;
}
