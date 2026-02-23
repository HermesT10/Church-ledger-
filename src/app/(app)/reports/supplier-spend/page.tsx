import { getSupplierSpendReport } from '@/lib/reports/glReports';
import { SupplierSpendClient } from './supplier-spend-client';

export default async function SupplierSpendPage() {
  const year = new Date().getFullYear();
  const { data, error } = await getSupplierSpendReport({ year });

  return (
    <SupplierSpendClient initialReport={data} error={error} />
  );
}
