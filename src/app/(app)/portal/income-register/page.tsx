import { requireCurrentPortalPage } from '@/lib/portal/current-user';
import { listPortalRegisterData } from '@/lib/portal/registers';
import { PortalRegisterClient } from '../portal-register-client';

export default async function PortalIncomeRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; fundId?: string }>;
}) {
  await requireCurrentPortalPage('income_register');
  const params = await searchParams;
  const year = Number.parseInt(params.year ?? String(new Date().getFullYear()), 10) || new Date().getFullYear();
  const { data } = await listPortalRegisterData({ registerType: 'income', year, fundId: params.fundId ?? null });
  return (
    <PortalRegisterClient
      register={data.register}
      registerType="income"
      scopeLabel={data.scopeLabel}
      permittedFunds={data.permittedFunds}
      canSubmitExpenses={false}
      year={year}
    />
  );
}
