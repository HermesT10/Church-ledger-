import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/app/(app)/settings/actions';
import { listEmployees } from '@/lib/employees/actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { NewPayrollClient } from './new-payroll-client';

export default async function NewPayrollPage() {
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/payroll');
  }

  const supabase = await createClient();

  // Fetch funds, settings, and employees in parallel
  const [fundsRes, settingsRes, employeesRes] = await Promise.all([
    supabase
      .from('funds')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
    getSettings(orgId),
    listEmployees(orgId),
  ]);

  const funds = (fundsRes.data ?? []) as { id: string; name: string }[];
  const employees = employeesRes.data ?? [];

  // Check if payroll accounts are configured
  const settings = settingsRes.data;
  const accountsConfigured = !!(
    settings?.payrollSalariesAccountId &&
    settings?.payrollErNicAccountId &&
    settings?.payrollPensionAccountId &&
    settings?.payrollPayeNicLiabilityId &&
    settings?.payrollPensionLiabilityId &&
    settings?.payrollNetPayLiabilityId
  );

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        title="New Payroll Run"
        subtitle="Capture payroll totals, allocate costs, and review the journal impact before posting."
      />
      <NewPayrollClient
        funds={funds}
        employees={employees}
        accountsConfigured={accountsConfigured}
      />
    </PageShell>
  );
}
