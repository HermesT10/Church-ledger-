import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getEmployee, getEmployeeDeleteDependencyPreview } from '@/lib/employees/actions';
import { getEmployeeMonitoringData } from '@/lib/employees/monitoring';
import { getEmployeePortalAccess } from '@/lib/invites/actions';
import { PageShell } from '@/components/page-shell';
import { EmployeeDetailClient } from './employee-detail-client';

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, role } = await getActiveOrg();
  const { data: employee } = await getEmployee(id);

  if (!employee || employee.organisation_id !== orgId) {
    notFound();
  }

  const canManagePortal = role === 'admin';
  const portalAccess = canManagePortal
    ? (await getEmployeePortalAccess(employee.id)).data
    : null;
  const monitoringData = canManagePortal
    ? (await getEmployeeMonitoringData(employee.id)).data
    : null;
  const deletePreview = canManagePortal
    ? (await getEmployeeDeleteDependencyPreview(employee.id)).data
    : null;

  return (
    <PageShell>
      <EmployeeDetailClient
        employee={employee}
        orgId={orgId}
        canManagePortal={canManagePortal}
        portalAccess={portalAccess}
        monitoringData={monitoringData}
        deletePreview={deletePreview}
      />
    </PageShell>
  );
}
