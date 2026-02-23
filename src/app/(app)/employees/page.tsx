import { getActiveOrg } from '@/lib/org';
import { listEmployees } from '@/lib/employees/actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { EmployeesClient } from './employees-client';

export default async function EmployeesPage() {
  const { orgId, role } = await getActiveOrg();
  const { data: employees } = await listEmployees(orgId, true);
  const canEdit = role === 'admin' || role === 'treasurer';

  return (
    <PageShell>
      <PageHeader
        title="Employees"
        subtitle="Manage employees for payroll processing."
      />
      <EmployeesClient employees={employees} canEdit={canEdit} />
    </PageShell>
  );
}
