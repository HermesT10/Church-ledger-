import { notFound, redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getPayrollRun } from '@/lib/payroll/actions';
import { getSettings } from '@/app/(app)/settings/actions';
import { PayrollDetailClient } from './payroll-detail-client';

export default async function PayrollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const { id } = await params;

  const run = await getPayrollRun(id);
  if (!run || run.organisationId !== orgId) {
    notFound();
  }

  // Fetch account names for journal preview
  const settingsRes = await getSettings(orgId);
  const settings = settingsRes.data;

  const canEdit = role === 'admin' || role === 'treasurer';

  return (
    <PayrollDetailClient
      run={run}
      settings={settings}
      canEdit={canEdit}
    />
  );
}
