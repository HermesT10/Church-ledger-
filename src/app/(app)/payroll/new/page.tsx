import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/app/(app)/settings/actions';
import { listEmployees } from '@/lib/employees/actions';
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
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">New Payroll Run</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter payroll figures per employee, and optionally split expenses across funds.
        </p>
      </div>

      <NewPayrollClient
        funds={funds}
        employees={employees}
        accountsConfigured={accountsConfigured}
      />
    </div>
  );
}
