import { getCashPositionReport } from '@/lib/reports/glReports';
import { CashPositionClient } from './cash-position-client';

export default async function CashPositionPage() {
  const { data, error } = await getCashPositionReport();

  return (
    <CashPositionClient initialReport={data} error={error} />
  );
}
