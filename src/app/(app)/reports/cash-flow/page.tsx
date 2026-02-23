import { getActiveOrg } from '@/lib/org';
import { getCashFlowReport } from '@/lib/reports/actions';
import { CashFlowClient } from './cash-flow-client';

export default async function CashFlowPage() {
  const { orgId, role } = await getActiveOrg();
  const year = new Date().getFullYear();

  const { data, error } = await getCashFlowReport({
    organisationId: orgId,
    year,
  });

  return (
    <CashFlowClient
      initialData={data}
      orgId={orgId}
      role={role}
      defaultYear={year}
      error={error}
    />
  );
}
