import { requireCurrentPortalPage } from '@/lib/portal/current-user';
import { listPortalRegisterData } from '@/lib/portal/registers';
import { PortalRegisterClient } from '../portal-register-client';

export default async function PortalExpenseRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; fundId?: string }>;
}) {
  await requireCurrentPortalPage('expense_register');
  const params = await searchParams;
  const year = Number.parseInt(params.year ?? String(new Date().getFullYear()), 10) || new Date().getFullYear();
  const { data } = await listPortalRegisterData({ registerType: 'expense', year, fundId: params.fundId ?? null });
  return (
    <PortalRegisterClient
      register={data.register}
      registerType="expense"
      scopeLabel={data.scopeLabel}
      permittedFunds={data.permittedFunds}
      canSubmitExpenses={data.canSubmitExpenses}
      year={year}
    />
  );
}
