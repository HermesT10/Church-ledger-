import { loadAnnualAccountsPack } from '@/lib/annual-accounts/data';
import { AnnualAccountsBuilderClient } from './annual-accounts-builder-client';

export const metadata = {
  alternates: {
    canonical: '/reports/annual/accounts-builder',
  },
  other: {
    yearEndCloseEntryPoint: '/year-end-close',
  },
};

export default async function AnnualAccountsBuilderPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string; basis?: string }>;
}) {
  const params = await searchParams;
  const year = params?.year ? Number(params.year) : new Date().getFullYear();
  const basis = params?.basis === 'cash' ? 'cash' : 'accruals';
  const { data, error } = await loadAnnualAccountsPack({ financialYear: year, basis });

  return <AnnualAccountsBuilderClient initialPack={data} initialError={error} />;
}
